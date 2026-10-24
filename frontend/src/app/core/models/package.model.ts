export interface ProductPackage {
  id: string | number;
  productId: string;
  name: string;
  imageUrl?: string | null;
  price?: number | null;
  description?: string | null;
  status?: 'ACTIVE' | 'INACTIVE' | 'DRAFT' | (string & {});
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

function normalizePkgString(s: string): string {
  return (s || '').toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
}

function resolveByProductId(productId?: string): ResolvedTaskScope | null {
  if (!productId) return null;
  const normPId = normalizePkgString(productId);
  const fp = FIXED_PACKAGES.find((p) => normalizePkgString(p.id) === normPId || normalizePkgString(p.name) === normPId);
  if (fp) {
    return {
      productId: fp.id,
      productName: fp.name,
      packageName: fp.name,
    };
  }
  return null;
}

function resolveFromMatchedPackage(pkg: { name: string; productId?: string }): ResolvedTaskScope {
  const pProdId = normalizePkgString(pkg.productId || '');
  const fp = FIXED_PACKAGES.find(
    (p) => normalizePkgString(p.id) === pProdId || normalizePkgString(p.name) === pProdId || (pProdId && normalizePkgString(p.id).includes(pProdId.replace('pkg ', '')))
  );
  if (fp) {
    return {
      productId: fp.id,
      productName: fp.name,
      packageName: pkg.name,
    };
  }
  const fallbackProdName = pkg.productId ? pkg.productId.replace(/^pkg_/i, '').replace(/[-_]/g, ' ') : 'Careermate';
  return {
    productId: pkg.productId || 'pkg_careermate',
    productName: fallbackProdName,
    packageName: pkg.name,
  };
}

function resolveByKeyword(text: string, rawPkg: string): ResolvedTaskScope | null {
  const norm = normalizePkgString(text);
  if (norm.includes('jesus') || norm.includes('messang') || norm.includes('messenger')) {
    return {
      productId: 'pkg_jesus_messanger',
      productName: 'Jesus the messanger',
      packageName: rawPkg || 'Jesus the messanger',
    };
  }
  if (norm.includes('class') || norm.includes('student')) {
    return {
      productId: 'pkg_classmate',
      productName: 'Classmate',
      packageName: rawPkg || 'Classmate',
    };
  }
  if (norm.includes('career') || norm.includes('current') || norm.includes('affair') || norm.includes('affari') || norm.includes('exam')) {
    return {
      productId: 'pkg_careermate',
      productName: 'Careermate',
      packageName: rawPkg || 'Careermate',
    };
  }
  return null;
}

function findMatchedPackageInList(
  packages: Array<{ name: string; productId?: string }>,
  normPkg: string,
  campNorm: string
): ResolvedTaskScope | null {
  if (normPkg) {
    const matched = packages.find((p) => normalizePkgString(p.name) === normPkg);
    if (matched) return resolveFromMatchedPackage(matched);
  }
  if (campNorm) {
    const matched = packages.find((p) => {
      const pNorm = normalizePkgString(p.name);
      return pNorm && (campNorm.includes(pNorm) || pNorm.includes(campNorm));
    });
    if (matched) return resolveFromMatchedPackage(matched);
  }
  return null;
}

export function resolveTaskProductAndPackage(
  t: { packageName?: string; title?: string; campaignName?: string; description?: string; content?: string; productId?: string; productName?: string },
  packages?: ProductPackage[] | { name: string; productId?: string }[]
): ResolvedTaskScope {
  const byProd = resolveByProductId(t.productId);
  if (byProd) {
    if (t.packageName) byProd.packageName = t.packageName;
    return byProd;
  }

  const rawPkg = (t.packageName || '').trim();
  const normPkg = normalizePkgString(rawPkg);

  if (packages && packages.length > 0) {
    const campNorm = normalizePkgString(`${t.campaignName || ''} ${t.title || ''}`);
    const found = findMatchedPackageInList(packages, normPkg, campNorm);
    if (found) return found;
  }

  if (normPkg) {
    const fp = FIXED_PACKAGES.find((p) => normalizePkgString(p.name) === normPkg || normalizePkgString(p.id) === normPkg);
    if (fp) {
      return { productId: fp.id, productName: fp.name, packageName: fp.name };
    }
    const byPkgKeyword = resolveByKeyword(normPkg, rawPkg);
    if (byPkgKeyword) return byPkgKeyword;
  }

  const combined = normalizePkgString(`${t.title || ''} ${t.description || ''} ${t.campaignName || ''} ${t.content || ''}`);
  const byCombinedKeyword = resolveByKeyword(combined, rawPkg);
  if (byCombinedKeyword) return byCombinedKeyword;

  return {
    productId: 'pkg_careermate',
    productName: 'Careermate',
    packageName: rawPkg || 'Package',
  };
}

function matchesExpectedProductId(resolved: ResolvedTaskScope, expectedProductId: string): boolean {
  const normExp = normalizePkgString(expectedProductId);
  const normTaskProd = normalizePkgString(resolved.productId);
  const normTaskName = normalizePkgString(resolved.productName);

  if (normTaskProd === normExp || normTaskName === normExp) return true;
  if (normExp.includes('career') && (normTaskProd.includes('career') || normTaskName.includes('career'))) return true;
  if (normExp.includes('class') && (normTaskProd.includes('class') || normTaskName.includes('class'))) return true;
  return Boolean(
    (normExp.includes('jesus') || normExp.includes('messang')) &&
    (normTaskProd.includes('jesus') || normTaskProd.includes('messang') || normTaskName.includes('jesus'))
  );
}

function matchesFixedPackage(resolved: ResolvedTaskScope, normTarget: string): boolean {
  const fixedProduct = FIXED_PACKAGES.find(
    (fp) => normalizePkgString(fp.name) === normTarget || normalizePkgString(fp.id) === normTarget
  );
  if (!fixedProduct) return false;
  const fixedId = normalizePkgString(fixedProduct.id);
  const fixedName = normalizePkgString(fixedProduct.name);
  const normTaskProd = normalizePkgString(resolved.productId);
  const normTaskName = normalizePkgString(resolved.productName);

  if (normTaskProd === fixedId || normTaskName === fixedName) return true;
  if (fixedId.includes('career') && (normTaskProd.includes('career') || normTaskName.includes('career'))) return true;
  if (fixedId.includes('class') && (normTaskProd.includes('class') || normTaskName.includes('class'))) return true;
  return Boolean(fixedId.includes('jesus') && (normTaskProd.includes('jesus') || normTaskProd.includes('messang') || normTaskName.includes('jesus')));
}

function matchesTargetTokens(
  normTarget: string,
  rawTPkg: string,
  normTaskPkg: string,
  campNameNorm: string,
  t: { title?: string }
): boolean {
  if (rawTPkg && (rawTPkg === normTarget || rawTPkg.includes(normTarget) || normTarget.includes(rawTPkg))) return true;
  if (normTaskPkg && normTaskPkg !== 'package' && (normTaskPkg === normTarget || normTaskPkg.includes(normTarget) || normTarget.includes(normTaskPkg))) return true;
  if (campNameNorm && (campNameNorm === normTarget || campNameNorm.includes(normTarget) || normTarget.includes(campNameNorm))) return true;

  if (t.title?.trim()) {
    const normTitle = normalizePkgString(t.title);
    if (normTitle && (normTitle === normTarget || normTitle.includes(normTarget) || normTarget.includes(normTitle))) return true;
  }

  const targetTokens = normTarget.split(/[\s-_]+/).filter((w) => w.length >= 4 && !['2026', 'package'].includes(w));
  const combinedTokens = `${rawTPkg} ${normTaskPkg} ${campNameNorm} ${normalizePkgString(t.title || '')} ${normalizePkgString((t as any).source || '')}`.toLowerCase();
  return targetTokens.some((tok) => combinedTokens.includes(tok) || combinedTokens.includes(tok.replace(/s$/, '')) || (tok.includes('affair') && combinedTokens.includes('affari')));
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

  const normTarget = normalizePkgString(cleanTarget);
  const resolved = resolveTaskProductAndPackage(t, extraPackages);

  if (expectedProductId && !matchesExpectedProductId(resolved, expectedProductId)) {
    return false;
  }

  if (matchesFixedPackage(resolved, normTarget)) {
    return true;
  }

  const normTaskPkg = normalizePkgString(resolved.packageName);
  const rawTPkg = normalizePkgString(t.packageName || '');
  const campNameNorm = normalizePkgString(t.campaignName || '');

  return matchesTargetTokens(normTarget, rawTPkg, normTaskPkg, campNameNorm, t);
}

function resolveProductFromNormalizedName(name: string) {
  if (name.includes('career') || name === 'pkg_careermate') {
    return { productId: 'pkg_careermate', productName: 'Careermate' };
  }
  if (name.includes('class') || name === 'pkg_classmate') {
    return { productId: 'pkg_classmate', productName: 'Classmate' };
  }
  if (name.includes('jesus') || name === 'pkg_jesus_messanger') {
    return { productId: 'pkg_jesus_messanger', productName: 'Jesus the messanger' };
  }
  return null;
}

export function resolveProductContext(
  targetPackage?: string,
  targetProduct?: string,
  dbPackages: ProductPackage[] = []
): { productId: string; productName: string; isSpecificPackage: boolean } {
  const normProd = (targetProduct || '').toLowerCase().trim();
  const normPkg = (targetPackage || '').toLowerCase().trim();

  if (normProd && normProd !== 'all') {
    const matched = resolveProductFromNormalizedName(normProd);
    if (matched) {
      const isSpecific = Boolean(normPkg && normPkg !== normProd && normPkg !== matched.productId && normPkg !== 'all');
      return { ...matched, isSpecificPackage: isSpecific };
    }
  }

  if (normPkg && normPkg !== 'all') {
    const matched = resolveProductFromNormalizedName(normPkg);
    if (matched) {
      return { ...matched, isSpecificPackage: false };
    }

    const match = dbPackages.find((p) => (p.name || '').toLowerCase().trim() === normPkg || String(p.id).toLowerCase() === normPkg);
    if (match?.productId) {
      const fromDb = resolveProductFromNormalizedName(match.productId.toLowerCase());
      if (fromDb) {
        return { ...fromDb, isSpecificPackage: true };
      }
    }
  }

  return { productId: 'pkg_careermate', productName: 'Careermate', isSpecificPackage: Boolean(normPkg && normPkg !== 'all') };
}

function matchesPackageName(
  item: { packageName?: string | null; campaignName?: string | null; name?: string | null; source?: string | null; title?: string | null },
  cleanPkg: string
): boolean {
  const itemPkg = (item.packageName || '').toLowerCase().trim();
  const itemName = (item.name || item.title || '').toLowerCase().trim();
  const itemCamp = (item.campaignName || '').toLowerCase().trim();
  const itemSrc = (item.source || '').toLowerCase().trim();

  if (itemPkg === cleanPkg || (itemPkg.length >= 3 && cleanPkg.includes(itemPkg)) || (cleanPkg.length >= 3 && itemPkg.includes(cleanPkg))) {
    return true;
  }
  return itemName.includes(cleanPkg) || itemCamp.includes(cleanPkg) || itemSrc.includes(cleanPkg);
}

function matchesProductCategory(
  item: { productId?: string | null; packageName?: string | null; campaignName?: string | null; name?: string | null; source?: string | null; title?: string | null },
  targetProdId: string
): boolean {
  const itemPkg = (item.packageName || '').toLowerCase().trim();
  const itemProd = (item.productId || '').toLowerCase().trim();
  const itemName = (item.name || item.title || '').toLowerCase().trim();
  const itemCamp = (item.campaignName || '').toLowerCase().trim();
  const itemSrc = (item.source || '').toLowerCase().trim();

  const isClassItem = itemProd.includes('class') || itemPkg.includes('class') || itemName.includes('class') || itemCamp.includes('class') || itemSrc.includes('class');
  const isJesusItem = itemProd.includes('jesus') || itemPkg.includes('jesus') || itemName.includes('jesus') || itemCamp.includes('jesus') || itemSrc.includes('jesus');

  if (targetProdId.includes('career')) {
    return !isClassItem && !isJesusItem;
  }
  if (targetProdId.includes('class')) {
    return isClassItem;
  }
  if (targetProdId.includes('jesus')) {
    return isJesusItem;
  }
  return true;
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

  if (cleanPkg && cleanPkg !== 'all' && matchesPackageName(item, cleanPkg)) {
    return true;
  }

  const resolved = resolveProductContext(targetPackage, targetProduct, dbPackages);
  return matchesProductCategory(item, resolved.productId.toLowerCase());
}
