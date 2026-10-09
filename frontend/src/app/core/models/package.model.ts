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

export function isTaskForPackage(
  t: { packageName?: string; title?: string; campaignName?: string; description?: string; content?: string },
  targetPackage?: string,
  extraPackages?: { name: string; productId?: string }[]
): boolean {
  if (!targetPackage) return true;
  const cleanTarget = targetPackage.trim();
  if (!cleanTarget || cleanTarget.toLowerCase() === 'all') return true;

  const normalize = (s: string) => s.toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
  const normTarget = normalize(cleanTarget);

  const fixedProduct = FIXED_PACKAGES.find(
    (fp) => normalize(fp.name) === normTarget || normalize(fp.id) === normTarget
  );


  if (fixedProduct) {
    const fixedId = normalize(fixedProduct.id);
    const fixedName = normalize(fixedProduct.name);

    if (t.packageName && t.packageName.trim()) {
      const normTPkg = normalize(t.packageName);


      if (normTPkg === fixedName || normTPkg === fixedId) {
        return true;
      }

      if (extraPackages && extraPackages.length > 0) {
        const match = extraPackages.find((p) => normalize(p.name || '') === normTPkg);
        if (match && match.productId) {
          const matchProd = normalize(match.productId);
          if (matchProd === fixedId || matchProd.includes(fixedId.replace('pkg ', '')) || fixedId.includes(matchProd)) {
            return true;
          }
    
          return false;
        }
      }

      if (fixedId.includes('career') && normTPkg.includes('career')) return true;
      if (fixedId.includes('class') && normTPkg.includes('class')) return true;
      if (fixedId.includes('jesus') && (normTPkg.includes('jesus') || normTPkg.includes('messang'))) return true;
      return false;
    }

  
    const combined = normalize(`${t.title || ''} ${t.description || ''} ${t.campaignName || ''} ${t.content || ''}`);
    if (fixedId.includes('career')) {
      return combined.includes('careermate') || combined.includes('career');
    }
    if (fixedId.includes('class')) {
      return combined.includes('classmate') || combined.includes('class') || combined.includes('student');
    }
    if (fixedId.includes('jesus')) {
      return combined.includes('jesus') || combined.includes('messang') || combined.includes('messenger');
    }
    return false;
  }


  if (t.packageName && t.packageName.trim()) {
    const normTPkg = normalize(t.packageName);
    if (normTPkg === normTarget || normTPkg.includes(normTarget) || normTarget.includes(normTPkg)) {
      return true;
    }
  }

  if (t.title && t.title.trim()) {
    const normTitle = normalize(t.title);
    if (normTitle === normTarget || normTitle.includes(normTarget) || normTarget.includes(normTitle)) {
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

  // 1. If explicit product provided
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

  // 2. If targetPackage matches fixed product
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

    // 3. Lookup in dbPackages
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

  // Default fallback to Careermate
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

  // 1. Direct package match
  if (cleanPkg && cleanPkg !== 'all') {
    if (itemPkg === cleanPkg || (itemPkg.length >= 3 && cleanPkg.includes(itemPkg)) || (cleanPkg.length >= 3 && itemPkg.includes(cleanPkg))) {
      return true;
    }
    if (itemName.includes(cleanPkg) || itemCamp.includes(cleanPkg) || itemSrc.includes(cleanPkg)) {
      return true;
    }
  }

  // 2. Product family resolution
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


