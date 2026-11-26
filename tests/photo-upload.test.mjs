import assert from "node:assert/strict";
import test from "node:test";
import { preparePhoto } from "../lib/photo-upload.ts";

test("resizes a phone photo larger than the old upload limit", async (t) => {
  const canvas = {
    getContext: () => ({ fillRect() {}, drawImage() {} }),
    toBlob(callback, type) { callback(new Blob(["jpeg"], { type })); },
  };
  const mocks = {
    Image: class {
      naturalWidth = 4032;
      naturalHeight = 3024;
      async decode() {}
    },
    document: { createElement: () => canvas },
    FileReader: class {
      readAsDataURL(blob) {
        this.result = "data:image/jpeg;base64,anBlZw==";
        assert.equal(blob.type, "image/jpeg");
        this.onload();
      }
    },
  };
  for (const [name, value] of Object.entries(mocks)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    });
  }
  const file = new File([new Uint8Array(3 * 1024 * 1024)], "phone.jpg", { type: "image/jpeg" });
  assert.deepEqual(await preparePhoto(file), { url: "data:image/jpeg;base64,anBlZw==", size: 4 });
  assert.deepEqual([canvas.width, canvas.height], [1600, 1200]);
});

test("rejects unsupported formats before attempting to decode", async () => {
  const file = new File(["image"], "photo.gif", { type: "image/gif" });
  await assert.rejects(preparePhoto(file), /Choose a JPEG, PNG, WebP/);
});
