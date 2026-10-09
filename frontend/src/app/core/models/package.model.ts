export interface ProductPackage {
  id: string | number;
  productId: string;
  name: string;
  imageUrl?: string | null;
  price?: number | null;
  description?: string | null;
  status?: 'ACTIVE' | 'INACTIVE' | 'DRAFT' | string;
  createdBy?: number | string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PackageSummary {
  pkg_careermate: number;
  pkg_classmate: number;
  pkg_jesus_messanger: number;
  total: number;
  [key: string]: number;
}

export interface FixedPackageMeta {
  id: string;
  name: string;
  icon: string;
  badgeColor: string;
}

export interface RoleOperationTab {
  id: string;
  label: string;
  icon: string;
  badge?: string;
  badgeType?: string;
}

export const FIXED_PACKAGES: FixedPackageMeta[] = [
  {
    id: 'pkg_careermate',
    name: 'Careermate',
    icon: 'business_center',
    badgeColor: 'blue',
  },
  {
    id: 'pkg_classmate',
    name: 'Classmate',
    icon: 'school',
    badgeColor: 'emerald',
  },
  {
    id: 'pkg_jesus_messanger',
    name: 'Jesus the messanger',
    icon: 'campaign',
    badgeColor: 'purple',
  },
];

export function isProduct(nameOrId?: string): boolean {
  if (!nameOrId) return false;
  const clean = nameOrId.toLowerCase().trim();
  return FIXED_PACKAGES.some(
    (fp) => fp.id.toLowerCase() === clean || fp.name.toLowerCase() === clean
  );
}

export interface ResolvedTaskScope {
  productId: string;
  productName: string;
  packageName: string;
}

export function resolveTaskProductAndPackage(
  t: { packageName?: string; title?: string; campaignName?: string; description?: string; content?: string; productId?: string; productName?: string },
  packages?: ProductPackage[] | { name: string; productId?: string }[]
): ResolvedTaskScope {
  const normalize = (s: string) => (s || '').toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();


  if (t.productId) {
    const normPId = normalize(t.productId);
    const fp = FIXED_PACKAGES.find((p) => normalize(p.id) === normPId || normalize(p.name) === normPId);
    if (fp) {
      return {
        productId: fp.id,
        productName: fp.name,
        packageName: t.packageName || fp.name,
      };
    }
  }

  const rawPkg = (t.packageName || '').trim();
  const normPkg = normalize(rawPkg);


  if (normPkg && packages && packages.length > 0) {
    const matchedPkg = packages.find((p) => normalize(p.name) === normPkg);
    if (matchedPkg) {
      const pProdId = normalize(matchedPkg.productId || '');
      const fp = FIXED_PACKAGES.find(
        (p) => normalize(p.id) === pProdId || normalize(p.name) === pProdId || (pProdId && normalize(p.id).includes(pProdId.replace('pkg ', '')))
      );
      if (fp) {
        return {
          productId: fp.id,
          productName: fp.name,
          packageName: matchedPkg.name,
        };
      }
      return {
        productId: matchedPkg.productId || 'pkg_careermate',
        productName: matchedPkg.productId ? matchedPkg.productId.replace(/^pkg_/i, '').replace(/[-_]/g, ' ') : 'Careermate',
        packageName: matchedPkg.name,
      };
    }
  }


  if (packages && packages.length > 0) {
    const campNorm = normalize(`${t.campaignName || ''} ${t.title || ''}`);
    if (campNorm) {
      const matchedPkg = packages.find((p) => {
        const pNorm = normalize(p.name);
        return pNorm && (campNorm.includes(pNorm) || pNorm.includes(campNorm));
      });
      if (matchedPkg) {
        const pProdId = normalize(matchedPkg.productId || '');
        const fp = FIXED_PACKAGES.find(
          (p) => normalize(p.id) === pProdId || normalize(p.name) === pProdId || (pProdId && normalize(p.id).includes(pProdId.replace('pkg ', '')))
        );
        return {
          productId: fp ? fp.id : (matchedPkg.productId || 'pkg_careermate'),
          productName: fp ? fp.name : (matchedPkg.productId ? matchedPkg.productId.replace(/^pkg_/i, '').replace(/[-_]/g, ' ') : 'Careermate'),
          packageName: matchedPkg.name,
        };
      }
    }
  }


  if (normPkg) {
    const fp = FIXED_PACKAGES.find((p) => normalize(p.name) === normPkg || normalize(p.id) === normPkg);
    if (fp) {
      return {
        productId: fp.id,
        productName: fp.name,
        packageName: fp.name,
      };
    }
  }


  if (normPkg.includes('jesus') || normPkg.includes('messang') || normPkg.includes('messenger')) {
    return {
      productId: 'pkg_jesus_messanger',
      productName: 'Jesus the messanger',
      packageName: rawPkg || 'Jesus the messanger',
    };
  }
  if (normPkg.includes('class') || normPkg.includes('student')) {
    return {
      productId: 'pkg_classmate',
      productName: 'Classmate',
      packageName: rawPkg || 'Classmate',
    };
  }
  if (normPkg.includes('career') || normPkg.includes('current') || normPkg.includes('affair') || normPkg.includes('affari') || normPkg.includes('exam')) {
    return {
      productId: 'pkg_careermate',
      productName: 'Careermate',
      packageName: rawPkg || 'Careermate',
    };
  }


  const combined = normalize(`${t.title || ''} ${t.description || ''} ${t.campaignName || ''} ${t.content || ''}`);
  if (combined.includes('jesus') || combined.includes('messang') || combined.includes('messenger')) {
    return {
      productId: 'pkg_jesus_messanger',
      productName: 'Jesus the messanger',
      packageName: rawPkg || 'Jesus the messanger',
    };
  }
  if (combined.includes('classmate') || combined.includes('student') || combined.includes('class')) {
    return {
      productId: 'pkg_classmate',
      productName: 'Classmate',
      packageName: rawPkg || 'Classmate',
    };
  }
  if (combined.includes('career') || combined.includes('careermate') || combined.includes('current') || combined.includes('affair') || combined.includes('affari') || combined.includes('exam')) {
    return {
      productId: 'pkg_careermate',
      productName: 'Careermate',
      packageName: rawPkg || 'Careermate',
    };
  }

  return {
    productId: 'pkg_careermate',
    productName: 'Careermate',
    packageName: rawPkg || 'Package',
  };
}

export function isTaskForPackage(
  t: { packageName?: string; title?: string; campaignName?: string; description?: string; content?: string; productId?: string; productName?: string },
  targetPackage?: string,
  extraPackages?: ProductPackage[] | { name: string; productId?: string }[],
  expectedProductId?: string
): boolean {
  if (!targetPackage) return true;
  const cleanTarget = targetPackage.trim();
  if (!cleanTarget || cleanTarget.toLowerCase() === 'all') return true;

  const normalize = (s: string) => (s || '').toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
  const normTarget = normalize(cleanTarget);

  
  const resolved = resolveTaskProductAndPackage(t, extraPackages);

 
  if (expectedProductId) {
    const normExpProd = normalize(expectedProductId);
    const normTaskProd = normalize(resolved.productId);
    const normTaskProdName = normalize(resolved.productName);

    const matchesExpectedProd =
      normTaskProd === normExpProd ||
      normTaskProdName === normExpProd ||
      (normExpProd.includes('career') && (normTaskProd.includes('career') || normTaskProdName.includes('career'))) ||
      (normExpProd.includes('class') && (normTaskProd.includes('class') || normTaskProdName.includes('class'))) ||
      ((normExpProd.includes('jesus') || normExpProd.includes('messang')) &&
        (normTaskProd.includes('jesus') || normTaskProd.includes('messang') || normTaskProdName.includes('jesus')));

    if (!matchesExpectedProd) {
      return false;
    }
  }


  const fixedProduct = FIXED_PACKAGES.find(
    (fp) => normalize(fp.name) === normTarget || normalize(fp.id) === normTarget
  );

  if (fixedProduct) {
    const fixedId = normalize(fixedProduct.id);
    const fixedName = normalize(fixedProduct.name);
    const normTaskProd = normalize(resolved.productId);
    const normTaskProdName = normalize(resolved.productName);

    if (normTaskProd === fixedId || normTaskProdName === fixedName) return true;
    if (fixedId.includes('career') && (normTaskProd.includes('career') || normTaskProdName.includes('career'))) return true;
    if (fixedId.includes('class') && (normTaskProd.includes('class') || normTaskProdName.includes('class'))) return true;
    if (fixedId.includes('jesus') && (normTaskProd.includes('jesus') || normTaskProd.includes('messang') || normTaskProdName.includes('jesus'))) return true;
    return false;
  }


  const normTaskPkg = normalize(resolved.packageName);
  const rawTPkg = normalize(t.packageName || '');
  const campNameNorm = normalize(t.campaignName || '');

  if (normTarget) {
    if (rawTPkg && (rawTPkg === normTarget || rawTPkg.includes(normTarget) || normTarget.includes(rawTPkg))) {
      return true;
    }
    if (normTaskPkg && normTaskPkg !== 'package' && (normTaskPkg === normTarget || normTaskPkg.includes(normTarget) || normTarget.includes(normTaskPkg))) {
      return true;
    }
    if (campNameNorm && (campNameNorm === normTarget || campNameNorm.includes(normTarget) || normTarget.includes(campNameNorm))) {
      return true;
    }
    if (t.title && t.title.trim()) {
      const normTitle = normalize(t.title);
      if (normTitle && (normTitle === normTarget || normTitle.includes(normTarget) || normTarget.includes(normTitle))) {
        return true;
      }
    }

    const targetTokens = normTarget.split(/[\s-_]+/).filter((w) => w.length >= 4 && !['2026', 'package'].includes(w));
    const combinedTokens = `${rawTPkg} ${normTaskPkg} ${campNameNorm} ${normalize(t.title || '')} ${normalize((t as any).source || '')}`.toLowerCase();
    if (targetTokens.length > 0 && targetTokens.some((tok) => combinedTokens.includes(tok) || combinedTokens.includes(tok.replace(/s$/, '')) || (tok.includes('affair') && combinedTokens.includes('affari')))) {
      return true;
    }
  }

  return false;
}

export function resolveProductContext(
  targetPackage?: string,
  targetProduct?: string,
  dbPackages: ProductPackage[] = []
): { productId: string; productName: string; isSpecificPackage: boolean } {
  const normProd = (targetProduct || '').toLowerCase().trim();
  const normPkg = (targetPackage || '').toLowerCase().trim();

 
  if (normProd && normProd !== 'all') {
    if (normProd.includes('career') || normProd === 'pkg_careermate') {
      return { productId: 'pkg_careermate', productName: 'Careermate', isSpecificPackage: !!normPkg && normPkg !== normProd && normPkg !== 'pkg_careermate' && normPkg !== 'all' };
    }
    if (normProd.includes('class') || normProd === 'pkg_classmate') {
      return { productId: 'pkg_classmate', productName: 'Classmate', isSpecificPackage: !!normPkg && normPkg !== normProd && normPkg !== 'pkg_classmate' && normPkg !== 'all' };
    }
    if (normProd.includes('jesus') || normProd === 'pkg_jesus_messanger') {
      return { productId: 'pkg_jesus_messanger', productName: 'Jesus the messanger', isSpecificPackage: !!normPkg && normPkg !== normProd && normPkg !== 'pkg_jesus_messanger' && normPkg !== 'all' };
    }
  }

  
  if (normPkg && normPkg !== 'all') {
    if (normPkg.includes('career') || normPkg === 'pkg_careermate') {
      return { productId: 'pkg_careermate', productName: 'Careermate', isSpecificPackage: false };
    }
    if (normPkg.includes('class') || normPkg === 'pkg_classmate') {
      return { productId: 'pkg_classmate', productName: 'Classmate', isSpecificPackage: false };
    }
    if (normPkg.includes('jesus') || normPkg === 'pkg_jesus_messanger') {
      return { productId: 'pkg_jesus_messanger', productName: 'Jesus the messanger', isSpecificPackage: false };
    }

   
    if (dbPackages && dbPackages.length > 0) {
      const match = dbPackages.find((p) => (p.name || '').toLowerCase().trim() === normPkg || String(p.id).toLowerCase() === normPkg);
      if (match && match.productId) {
        const pProd = match.productId.toLowerCase();
        if (pProd.includes('career')) return { productId: 'pkg_careermate', productName: 'Careermate', isSpecificPackage: true };
        if (pProd.includes('class')) return { productId: 'pkg_classmate', productName: 'Classmate', isSpecificPackage: true };
        if (pProd.includes('jesus')) return { productId: 'pkg_jesus_messanger', productName: 'Jesus the messanger', isSpecificPackage: true };
      }
    }
  }

 
  return { productId: 'pkg_careermate', productName: 'Careermate', isSpecificPackage: !!normPkg && normPkg !== 'all' };
}

export function isItemForPackage(
  item: { productId?: string | null; packageName?: string | null; campaignName?: string | null; name?: string | null; source?: string | null; title?: string | null },
  targetPackage?: string,
  targetProduct?: string,
  dbPackages: ProductPackage[] = []
): boolean {
  if (!targetPackage && !targetProduct) return true;
  const cleanPkg = (targetPackage || '').toLowerCase().trim();
  const cleanProd = (targetProduct || '').toLowerCase().trim();
  if ((!cleanPkg || cleanPkg === 'all') && (!cleanProd || cleanProd === 'all')) return true;

  const itemPkg = (item.packageName || '').toLowerCase().trim();
  const itemProd = (item.productId || '').toLowerCase().trim();
  const itemName = (item.name || item.title || '').toLowerCase().trim();
  const itemCamp = (item.campaignName || '').toLowerCase().trim();
  const itemSrc = (item.source || '').toLowerCase().trim();


  if (cleanPkg && cleanPkg !== 'all') {
    if (itemPkg === cleanPkg || (itemPkg.length >= 3 && cleanPkg.includes(itemPkg)) || (cleanPkg.length >= 3 && itemPkg.includes(cleanPkg))) {
      return true;
    }
    if (itemName.includes(cleanPkg) || itemCamp.includes(cleanPkg) || itemSrc.includes(cleanPkg)) {
      return true;
    }
  }


  const resolved = resolveProductContext(targetPackage, targetProduct, dbPackages);
  const targetProdId = resolved.productId.toLowerCase();

  const isClassItem = itemProd.includes('class') || itemPkg.includes('class') || itemName.includes('class') || itemCamp.includes('class') || itemSrc.includes('class');
  const isJesusItem = itemProd.includes('jesus') || itemPkg.includes('jesus') || itemName.includes('jesus') || itemCamp.includes('jesus') || itemSrc.includes('jesus');
  const isCareerItem = itemProd.includes('career') || itemPkg.includes('career') || itemName.includes('career') || itemCamp.includes('career') || itemSrc.includes('career') || (!itemProd && !itemPkg && !isClassItem && !isJesusItem);

  if (targetProdId.includes('career')) {
    if (isClassItem || isJesusItem) return false;
    return true;
  }
  if (targetProdId.includes('class')) {
    return isClassItem;
  }
  if (targetProdId.includes('jesus')) {
    return isJesusItem;
  }

  return true;
}


