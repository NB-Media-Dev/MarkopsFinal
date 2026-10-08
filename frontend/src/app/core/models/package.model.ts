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

