const express = require('express');
const fs = require('fs');
const path = require('path');
const { dbPool, dbPackagesStore } = require('../db');
const { emitRealtimeEvent } = require('../events');

const router = express.Router();

function normalizeProductId(val) {
  if (!val || typeof val !== 'string') return '';
  const clean = val.toLowerCase().trim();
  if (clean === 'pkg_careermate' || clean.includes('career')) return 'pkg_careermate';
  if (clean === 'pkg_classmate' || clean.includes('class')) return 'pkg_classmate';
  if (clean === 'pkg_jesus_messanger' || clean.includes('jesus') || clean.includes('messang') || clean.includes('messeng')) {
    return 'pkg_jesus_messanger';
  }
  return clean;
}

function saveBase64PackageImage(dataUrl, fileName = 'package_banner.png') {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return dataUrl || null;
  }
  try {
    const matches = dataUrl.match(/^data:([A-Za-z0-9-+\/.]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return dataUrl;
    }
    const buffer = Buffer.from(matches[2], 'base64');
    const safeName = (fileName || 'package_banner.png').replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueName = `pkg_${Date.now()}_${safeName}`;
    const targetDir = path.resolve('uploads/packages');
    fs.mkdirSync(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, uniqueName);
    fs.writeFileSync(targetPath, buffer);
    return `/uploads/packages/${uniqueName}`;
  } catch (e) {
    console.error('[Package Image Error] Failed to write file to disk:', e?.message || e);
    return dataUrl;
  }
}


router.get('/packages', async (req, res) => {
  const reqProduct = req.query.productId || req.query.product || req.query.package;
  const normalizedKey = reqProduct ? normalizeProductId(reqProduct) : null;

  try {
    if (dbPool) {
      try {
        let query = `SELECT * FROM packages`;
        let params = [];

        if (normalizedKey) {
          query += ` WHERE product_id = ? OR product_id = ? OR LOWER(product_id) LIKE ?`;
          params = [normalizedKey, reqProduct, `%${normalizedKey.replace('pkg_', '')}%`];
        }
        query += ` ORDER BY id DESC`;

        const [rows] = await dbPool.query(query, params);
        if (Array.isArray(rows)) {
          const mapped = rows.map((r) => ({
            id: r.id,
            productId: r.product_id,
            name: r.name,
            imageUrl: r.image_url,
            price: r.price !== null ? Number(r.price) : null,
            description: r.description,
            status: r.status || 'ACTIVE',
            createdBy: r.created_by,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
          }));
          return res.json(mapped);
        }
      } catch (dbErr) {
        console.warn('[MySQL packages GET error, falling back to memory store]:', dbErr?.message || dbErr);
      }
    }

  
    let list = [...dbPackagesStore];
    if (normalizedKey) {
      list = list.filter((p) => {
        const pNorm = normalizeProductId(p.productId);
        return pNorm === normalizedKey || (p.productId && p.productId.toLowerCase().includes(normalizedKey.replace('pkg_', '')));
      });
    }
    list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return res.json(list);
  } catch (err) {
    console.error('[Packages GET Error]:', err);
    return res.status(500).json({ error: 'Failed to fetch packages.' });
  }
});


router.get('/packages/summary', async (req, res) => {
  try {
    const summary = {
      pkg_careermate: 0,
      pkg_classmate: 0,
      pkg_jesus_messanger: 0,
      total: 0,
    };

    if (dbPool) {
      try {
        const [rows] = await dbPool.query(`SELECT product_id, COUNT(*) as count FROM packages GROUP BY product_id`);
        if (Array.isArray(rows)) {
          rows.forEach((r) => {
            const key = normalizeProductId(r.product_id);
            const count = Number(r.count || 0);
            if (summary[key] !== undefined) {
              summary[key] += count;
            } else {
              summary[key] = count;
            }
            summary.total += count;
          });
          return res.json(summary);
        }
      } catch (dbErr) {
        console.warn('[MySQL packages summary fallback]:', dbErr?.message || dbErr);
      }
    }

  
    dbPackagesStore.forEach((p) => {
      const key = normalizeProductId(p.productId);
      if (summary[key] !== undefined) {
        summary[key]++;
      }
      summary.total++;
    });
    return res.json(summary);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch package summary.' });
  }
});


router.get('/packages/:id', async (req, res) => {
  const { id } = req.params;
  try {
    if (dbPool) {
      try {
        const [rows] = await dbPool.query(`SELECT * FROM packages WHERE id = ?`, [id]);
        if (Array.isArray(rows) && rows.length > 0) {
          const r = rows[0];
          return res.json({
            id: r.id,
            productId: r.product_id,
            name: r.name,
            imageUrl: r.image_url,
            price: r.price !== null ? Number(r.price) : null,
            description: r.description,
            status: r.status || 'ACTIVE',
            createdBy: r.created_by,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
          });
        }
      } catch (dbErr) {
        console.warn('[MySQL package GET ID fallback]:', dbErr?.message || dbErr);
      }
    }

    const item = dbPackagesStore.find((p) => String(p.id) === String(id));
    if (!item) {
      return res.status(404).json({ error: 'Package not found' });
    }
    return res.json(item);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch package.' });
  }
});


router.post('/packages', async (req, res) => {
  const userRole = String(req.user?.role || req.headers['x-user-role'] || '').toUpperCase();
  if (userRole && userRole !== 'ADMINISTRATOR' && userRole !== 'ADMIN') {
    return res.status(403).json({ error: 'Access denied. Only administrators can create packages.' });
  }

  const { name, productId, product, imageUrl, image, price, description, status, fileName } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Package name is required.' });
  }

  const rawProd = productId || product || 'pkg_careermate';
  const targetProductId = normalizeProductId(rawProd);
  const rawImage = imageUrl || image || null;
  const processedImageUrl = saveBase64PackageImage(rawImage, fileName || `${name.trim().toLowerCase().replace(/\s+/g, '_')}.png`);
  const numericPrice = price !== undefined && price !== null && price !== '' ? Number(price) : null;
  const userId = req.user?.id || 1;

  const newPackage = {
    id: Date.now(),
    productId: targetProductId,
    name: name.trim(),
    imageUrl: processedImageUrl,
    price: numericPrice,
    description: description ? description.trim() : null,
    status: status || 'ACTIVE',
    createdBy: userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    if (dbPool) {
      try {
        const [insertRes] = await dbPool.query(
          `INSERT INTO packages (product_id, name, image_url, price, description, status, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [targetProductId, newPackage.name, newPackage.imageUrl, newPackage.price, newPackage.description, newPackage.status, userId]
        );
        if (insertRes && insertRes.insertId) {
          newPackage.id = insertRes.insertId;
        }
      } catch (dbErr) {
        console.error('[MySQL package insert error, saving to memory]:', dbErr?.message || dbErr);
      }
    }

    dbPackagesStore.unshift(newPackage);
    emitRealtimeEvent('package:created', newPackage);

    return res.status(201).json(newPackage);
  } catch (err) {
    console.error('[Packages POST Error]:', err);
    return res.status(500).json({ error: 'Failed to create package.' });
  }
});


router.put('/packages/:id', async (req, res) => {
  const userRole = String(req.user?.role || req.headers['x-user-role'] || '').toUpperCase();
  if (userRole && userRole !== 'ADMINISTRATOR' && userRole !== 'ADMIN') {
    return res.status(403).json({ error: 'Access denied. Only administrators can update packages.' });
  }

  const { id } = req.params;
  const { name, productId, imageUrl, image, price, description, status, fileName } = req.body;

  const rawImage = imageUrl || image;
  const processedImageUrl = rawImage ? saveBase64PackageImage(rawImage, fileName || 'package_image.png') : undefined;
  const targetProductId = productId ? normalizeProductId(productId) : undefined;
  const numericPrice = price !== undefined && price !== null && price !== '' ? Number(price) : undefined;

  try {
    let updatedObj = null;

    if (dbPool) {
      try {
        const updates = [];
        const params = [];

        if (name !== undefined) {
          updates.push('name = ?');
          params.push(name.trim());
        }
        if (targetProductId !== undefined) {
          updates.push('product_id = ?');
          params.push(targetProductId);
        }
        if (processedImageUrl !== undefined) {
          updates.push('image_url = ?');
          params.push(processedImageUrl);
        }
        if (numericPrice !== undefined) {
          updates.push('price = ?');
          params.push(numericPrice);
        }
        if (description !== undefined) {
          updates.push('description = ?');
          params.push(description);
        }
        if (status !== undefined) {
          updates.push('status = ?');
          params.push(status);
        }

        if (updates.length > 0) {
          updates.push('updated_at = NOW()');
          params.push(id);
          await dbPool.query(`UPDATE packages SET ${updates.join(', ')} WHERE id = ?`, params);
        }

        const [rows] = await dbPool.query(`SELECT * FROM packages WHERE id = ?`, [id]);
        if (Array.isArray(rows) && rows.length > 0) {
          const r = rows[0];
          updatedObj = {
            id: r.id,
            productId: r.product_id,
            name: r.name,
            imageUrl: r.image_url,
            price: r.price !== null ? Number(r.price) : null,
            description: r.description,
            status: r.status || 'ACTIVE',
            createdBy: r.created_by,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
          };
        }
      } catch (dbErr) {
        console.warn('[MySQL package update fallback]:', dbErr?.message || dbErr);
      }
    }

    const idx = dbPackagesStore.findIndex((p) => String(p.id) === String(id));
    if (idx !== -1) {
      dbPackagesStore[idx] = {
        ...dbPackagesStore[idx],
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(targetProductId !== undefined ? { productId: targetProductId } : {}),
        ...(processedImageUrl !== undefined ? { imageUrl: processedImageUrl } : {}),
        ...(numericPrice !== undefined ? { price: numericPrice } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(status !== undefined ? { status } : {}),
        updatedAt: new Date().toISOString(),
      };
      if (!updatedObj) updatedObj = dbPackagesStore[idx];
    }

    if (!updatedObj) {
      return res.status(404).json({ error: 'Package not found' });
    }

    emitRealtimeEvent('package:updated', updatedObj);
    return res.json(updatedObj);
  } catch (err) {
    console.error('[Packages PUT Error]:', err);
    return res.status(500).json({ error: 'Failed to update package.' });
  }
});


router.delete('/packages/:id', async (req, res) => {
  const userRole = String(req.user?.role || req.headers['x-user-role'] || '').toUpperCase();
  if (userRole && userRole !== 'ADMINISTRATOR' && userRole !== 'ADMIN') {
    return res.status(403).json({ error: 'Access denied. Only administrators can delete packages.' });
  }

  const { id } = req.params;

  try {
    if (dbPool) {
      try {
        await dbPool.query(`DELETE FROM packages WHERE id = ?`, [id]);
      } catch (dbErr) {
        console.warn('[MySQL package delete fallback]:', dbErr?.message || dbErr);
      }
    }

    const initialLen = dbPackagesStore.length;
    const filtered = dbPackagesStore.filter((p) => String(p.id) !== String(id));
    dbPackagesStore.length = 0;
    dbPackagesStore.push(...filtered);

    emitRealtimeEvent('package:deleted', { id });
    return res.json({ success: true, message: 'Package deleted successfully.', id });
  } catch (err) {
    console.error('[Packages DELETE Error]:', err);
    return res.status(500).json({ error: 'Failed to delete package.' });
  }
});

module.exports = router;
