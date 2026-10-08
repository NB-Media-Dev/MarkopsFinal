const express = require('express');
const fs = require('fs');
const path = require('path');
const { dbPool } = require('../db');

const router = express.Router();
const MIME_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const IMAGE_SIGNATURES = {
  'image/jpeg': (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  'image/png': (buffer) => buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  'image/webp': (buffer) =>
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP',
};

function getProductId(value) {
  return String(value || '').trim().toLowerCase();
}

function saveBannerImage(dataUrl, fileName) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match || !MIME_EXTENSIONS[match[1]]) {
    throw new Error('Banner must be a valid JPG, PNG, or WebP image.');
  }

  const imageBuffer = Buffer.from(match[2], 'base64');
  if (imageBuffer.length === 0 || imageBuffer.length > 10 * 1024 * 1024) {
    throw new Error('Banner image must be larger than 0 bytes and no larger than 10 MB.');
  }
  if (!IMAGE_SIGNATURES[match[1]](imageBuffer)) {
    throw new Error('The selected file is not a valid JPG, PNG, or WebP image.');
  }

  const safeName = path.basename(String(fileName || 'hero-banner'))
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 80);
  const uniqueName = `hero_${Date.now()}_${safeName || 'banner'}.${MIME_EXTENSIONS[match[1]]}`;
  const targetDir = path.resolve(__dirname, '../../uploads/product-banners');
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, uniqueName), imageBuffer);
  return `/uploads/product-banners/${uniqueName}`;
}

router.get('/product-banners/:productId', async (req, res) => {
  const productId = getProductId(req.params.productId);

  try {
    if (!dbPool.isConnected()) {
      return res.status(503).json({ error: 'Product catalog database is unavailable.' });
    }
    const [rows] = await dbPool.queryStrict(
      'SELECT id AS product_id, hero_image_url FROM product_catalog WHERE id = ?',
      [productId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Product not found.' });
    }
    return res.json({
      productId: rows[0].product_id,
      imageUrl: rows[0].hero_image_url,
    });
  } catch (error) {
    console.error('[Product Hero Banner GET Error]:', error);
    return res.status(500).json({ error: 'Failed to load product hero banner.' });
  }
});

router.put('/product-banners/:productId', async (req, res) => {
  const role = String(req.user?.role || '').toUpperCase();
  if (role !== 'ADMINISTRATOR' && role !== 'ADMIN') {
    return res.status(403).json({ error: 'Access denied. Only administrators can update product banners.' });
  }

  const productId = getProductId(req.params.productId);
  if (typeof req.body?.image !== 'string') {
    return res.status(400).json({ error: 'A banner image is required.' });
  }

  if (!dbPool.isConnected()) {
    return res.status(503).json({ error: 'Product catalog database is unavailable.' });
  }

  try {
    const [products] = await dbPool.queryStrict(
      'SELECT id FROM product_catalog WHERE id = ?',
      [productId]
    );
    if (products.length === 0) {
      return res.status(404).json({ error: 'Product not found.' });
    }
  } catch (error) {
    console.error('[Product Hero Banner Product Lookup Error]:', error);
    return res.status(500).json({ error: 'Failed to verify product before saving banner.' });
  }

  let imageUrl;
  try {
    imageUrl = saveBannerImage(req.body.image, req.body.fileName);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  try {
    const [result] = await dbPool.queryStrict(
      'UPDATE product_catalog SET hero_image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [imageUrl, productId]
    );
    if (result.affectedRows !== 1) {
      return res.status(404).json({ error: 'Product not found or banner was not updated.' });
    }
    return res.json({ productId, imageUrl });
  } catch (error) {
    console.error('[Product Hero Banner PUT Error]:', error);
    return res.status(500).json({ error: 'Failed to save product hero banner.' });
  }
});

module.exports = router;
