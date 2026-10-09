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

  // If task already has explicit productId or productName
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

  // 1. Check if rawPkg directly matches a package in packages list
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

  // 1b. Check if campaignName or title matches any package in packages list
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

  // 2. Check if rawPkg directly matches one of the FIXED_PACKAGES
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

  // 3. Keyword matching on rawPkg
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

  // 4. Keyword matching in title / description / campaign / content
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

  // Default fallback if unknown
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

  // Resolve the task's true product and package
  const resolved = resolveTaskProductAndPackage(t, extraPackages);

  // If expectedProductId is specified, the task MUST belong to this product!
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

  // Check if targetPackage is a fixed product (e.g. Careermate, Classmate, Jesus the messanger)
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

  // Target is a specific sub-package (e.g. 'examination-2026', 'TNPSC', etc.)
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

export function isLeadForPackage(
  l: {
    source?: string;
    campaignName?: string;
    packageName?: string;
    package?: string;
    productId?: string;
    product_id?: string;
    productName?: string;
    product?: string;
    [key: string]: any;
  },
  targetPackage?: string,
  extraPackages?: ProductPackage[] | { name: string; productId?: string }[],
  expectedProductId?: string
): boolean {
  if (!l) return false;
  const leadAdapter = {
    packageName: (l.packageName || l.package || '').trim(),
    campaignName: (l.campaignName || '').trim(),
    title: (l.campaignName || l.packageName || l.package || l.source || '').trim(),
    productId: l.productId || l.product_id || '',
    productName: l.productName || l.product || '',
  };
  return isTaskForPackage(leadAdapter, targetPackage, extraPackages, expectedProductId);
}

