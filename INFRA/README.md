# AfroIE Meet on EC2

This package provisions private staging in Ireland. It replaces Fargate with one x86 t3.small and an Elastic IP. It retains the PostgreSQL 16 db.t4g.micro, 20 GB gp3, ECR, and the private database network. Caddy runs alongside the app on EC2. There is no NAT Gateway or load balancer.

## 1. Review and provision

Install Terraform 1.10+, AWS CLI, and Docker on your workstation. Sign in to the intended AWS account and verify it with `aws sts get-caller-identity`. Leave hostname and route53_zone_id unset for private staging. You do not need a domain or a pre-existing RDS instance. Terraform creates RDS when you apply.

For shared state, provision a separate private, encrypted, versioned S3 bucket and copy `backend.tf.example` to `backend.tf` before init. Without that file Terraform uses local state. This configuration uses the existing INFRA Terraform root. Review the current state and plan before applying. If AWS resources still exist outside this state, confirm ownership before importing or recreating them.

```powershell
terraform init
terraform fmt -check
terraform validate
terraform plan -out=staging.tfplan
terraform show staging.tfplan
# After reviewing the account, region, costs and resources:
terraform apply staging.tfplan
```

With no hostname, the EC2 security group has no inbound rules and Terraform creates no DNS record. EC2, EBS, IPv4, RDS, Secrets Manager and ECR are billable. The database has deletion protection and requires a final snapshot for intentional teardown. Choose a unique final snapshot identifier if the example name already exists.

## 2. Publish the app

Run these PowerShell commands from the AfroIE Meet repository on your workstation. Set the repository URL from the Terraform output and choose a fresh release tag for each build.

```powershell
$repo = 'ACCOUNT_ID.dkr.ecr.eu-west-1.amazonaws.com/afroie-meet-ec2-staging'
$registry = ($repo -split '/')[0]
$tag = 'staging-001'
aws ecr get-login-password --region eu-west-1 | docker login --username AWS --password-stdin $registry
docker build --platform linux/amd64 --target runner -t "${repo}:${tag}" .
docker push "${repo}:${tag}"
aws ecr describe-images --region eu-west-1 --repository-name afroie-meet-ec2-staging --image-ids "imageTag=$tag" --query 'imageDetails[0].imageDigest' --output text
```

Stop if a command fails. Scan and approve the exact app and Caddy images before deployment. Set APP_IMAGE and CADDY_IMAGE in the hosted .env using their digests. The Caddy image must support the basic_auth directive (Caddy 2.8 or later).

## 3. Prepare EC2 and database access

Open the instance with EC2 → Connect → Session Manager. The bootstrap script installs and starts Docker. Check `sudo cloud-init status --wait` and `sudo docker version`. Install the Docker Compose v2 CLI plugin on the instance from the official Docker Compose Linux releases. Install a verified linux-x86_64 binary at `/usr/local/lib/docker/cli-plugins/docker-compose`, make it executable, and check `sudo docker compose version`.

Copy the hosted Compose file, Caddyfile.private, Caddyfile, fetch-runtime-secrets.sh and environment templates into /opt/afroie-meet via your approved file transfer method, or paste them into files in Session Manager. Run the remaining host commands as root there. Keep the private Caddyfile for the initial deployment. Session Manager and IAM control access.

```bash
sudo -i
cd /opt/afroie-meet
umask 077
cp .env.example .env
# Fill in APP_IMAGE and CADDY_IMAGE in .env before continuing.
set -a
. ./.env
set +a
curl --fail --silent --show-error   https://truststore.pki.rds.amazonaws.com/eu-west-1/eu-west-1-bundle.pem   -o rds-ca.pem
chmod 644 rds-ca.pem
```

Retrieve the RDS-generated administrator credential using an authorised operator identity. Connect from EC2 with psql and TLS certificate verification to create a dedicated non-admin PostgreSQL login such as afroie_app. For this staging setup, make that login the owner of the fresh application database and use it for migrations and runtime. Keep the admin password out of the app and command history. For a real-member release, separate the migration owner and restricted runtime login.

Terraform creates two empty Secrets Manager entries. After apply, run `terraform output -json runtime_secret_arns` and use the AWS Secrets Manager console as an authorised operator to set each **plaintext string** value (a raw string, without JSON quotes or a key/value object):

- **database-url** contains the full DATABASE_URL from .env.app.example, with the actual RDS endpoint and the percent-encoded password that you set on the afroie_app PostgreSQL login. Keep the TLS options intact.
- **session-secret** contains a fresh session-signing secret generated with `openssl rand -base64 72 | tr '/+' '_-' | tr -d '\n' && printf '\n'`.

AWS generates and manages the RDS master password separately. The EC2 instance profile can read only the two runtime entries. It does not have access to the RDS master secret. Keep the runtime values outside Terraform, Git, EC2 user data and shell command history.

From /opt/afroie-meet, run the fetch script with the two actual ARNs from the Terraform output:

```bash
bash fetch-runtime-secrets.sh 'DATABASE_URL_SECRET_ARN' 'SESSION_SECRET_ARN'
```

The script uses the EC2 instance profile through the AWS CLI. Run it without operator AWS credentials in the environment. It replaces the root-owned .env.app atomically with mode 0600 after both reads succeed. Re-run it after a secret changes and recreate the app container to load the new environment. A database credential change also requires updating the PostgreSQL login, and changing SESSION_SECRET invalidates existing sessions.

## 4. Migrate and start

On EC2, replace the registry placeholder with the hostname from the ECR output. This is the part before /afroie-meet-ec2-staging.

```bash
aws ecr get-login-password --region eu-west-1 |
  docker login --username AWS --password-stdin ACCOUNT_ID.dkr.ecr.eu-west-1.amazonaws.com
docker compose -f compose.hosted.yaml config --quiet
docker compose -f compose.hosted.yaml pull
docker compose -f compose.hosted.yaml run --rm --no-deps app ./node_modules/.bin/prisma migrate deploy
docker compose -f compose.hosted.yaml up -d --wait
docker compose -f compose.hosted.yaml ps
```

Generate two seven-day codes, running the following command once for each fictional account. Share each code privately.

```bash
docker compose -f compose.hosted.yaml exec app node scripts/create-invitation.mjs 7
```

## 5. Test over Session Manager without DNS

On EC2, export only the Caddy public CA certificate from the running container over your trusted Session Manager shell:

```bash
docker compose -f compose.hosted.yaml exec -T caddy cat /data/caddy/pki/authorities/local/root.crt
```

Save the displayed PEM certificate as caddy-staging-ca.crt on your computer. The CA private key stays on EC2. From your workstation, install the AWS Session Manager plugin, then run this command from your Terraform directory in Bash with your AWS operator identity:

```bash
aws ssm start-session --region eu-west-1 --target "$(terraform output -raw instance_id)" \
  --document-name AWS-StartPortForwardingSession \
  --parameters 'portNumber=443,localPortNumber=8443'
```

Leave that command running. In a second terminal, verify the full HTTPS chain with the public CA you exported:

```bash
curl --fail --cacert caddy-staging-ca.crt https://localhost:8443/api/health
```

For a browser test, trust that specific CA in an isolated test environment and visit https://localhost:8443. Verify invite redemption, introductions, matching, sending a message without reloading, and two-sided blocking with fictional accounts. Access requires a live IAM-authorised tunnel. Rehearse restoring a backup and rolling back to a previous app digest before launch.

## 6. Add a public hostname later

Set hostname in terraform.tfvars and optionally route53_zone_id if you have an existing public Route 53 zone. Review and apply the resulting plan. If Terraform does not manage DNS, set the hostname's A record to the existing Elastic IP. Keep AAAA unset for this IPv4-only stack.

On EC2, use the public Caddyfile and replace its password hash placeholder with output from `docker run --rm -it "$CADDY_IMAGE" caddy hash-password`. In .env set APP_ORIGIN to the exact public HTTPS origin, STAGING_HOST to the domain name, CADDY_BIND to 0.0.0.0, and CADDY_CONFIG to ./Caddyfile. Rerun `docker compose -f compose.hosted.yaml up -d --wait` and check publicly trusted HTTPS and tester authentication. The Terraform plan should keep the app host and database in place when adding DNS.

References: Terraform S3 backend at https://developer.hashicorp.com/terraform/language/backend/s3, AWS private RDS connectivity at https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/tutorial-connect-ec2-instance-to-rds-database.html, Docker Compose plugin at https://docs.docker.com/compose/install/linux/, and Caddy HTTPS at https://caddyserver.com/docs/automatic-https.
