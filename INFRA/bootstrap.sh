#!/bin/bash
set -euo pipefail
dnf install -y docker
systemctl enable --now docker
systemctl enable --now amazon-ssm-agent
install -d -m 0750 /opt/afroie-meet
