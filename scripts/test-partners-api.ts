import 'dotenv/config';
import { prisma } from '../src/lib/db';
import crypto from "crypto";

(async () => {
  try {
    // Get the demo tenant
    const tenant = await prisma.tenant.findFirst({
      where: { slug: "fabrika-beta" },
    });
    if (!tenant) {
      console.error("Demo tenant not found");
      process.exit(1);
    }

    // Create a test API key
    const keyId = crypto.randomBytes(16).toString("hex");
    const keySecret = crypto.randomBytes(32).toString("hex");
    const keyHashInput = `${keyId}:${keySecret}`;
    const keyHash = crypto.createHash("sha256").update(keyHashInput).digest("hex");
    const prefix = keyId.slice(0, 8);  // First 8 chars as prefix

    await prisma.apiKey.create({
      data: {
        tenantId: tenant.id,
        name: "Test Partners API",
        keyHash,
        prefix,
      },
    });

    console.log(`API Key created!`);
    console.log(`Full key: ${keyId}:${keySecret}`);
    console.log(`\nTest list endpoint:\ncurl -H "x-api-key: ${keyId}:${keySecret}" http://localhost:3311/api/v1/partners`);
    console.log(`\nTest detail endpoint (with PIC 992266):\ncurl -H "x-api-key: ${keyId}:${keySecret}" http://localhost:3311/api/v1/partners/992266`);
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
})();
