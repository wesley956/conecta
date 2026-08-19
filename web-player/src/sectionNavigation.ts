export type CatalogSection = 'live' | 'movies' | 'series';

export type SectionNavigationState = {
  activeSection: CatalogSection | null;
  categoriesOpen: boolean;
  collapsed: boolean;
  mobileSheetOpen: boolean;
  categoryBySection: Record<CatalogSection, string>;
};

export const CATEGORY_SEARCH_THRESHOLD = 24;

export function createSectionNavigationState(): SectionNavigationState {
  return {
    activeSection: null,
    categoriesOpen: false,
    collapsed: false,
    mobileSheetOpen: false,
    categoryBySection: {
      live: 'Todos',
      movies: 'Todos',
      series: 'Todos',
    },
  };
}

export function enterCatalogSection(
  state: SectionNavigationState,
  section: CatalogSection,
): SectionNavigationState {
  return {
    ...state,
    activeSection: section,
    categoriesOpen: true,
    mobileSheetOpen: false,
  };
}

export function leaveCatalogSection(state: SectionNavigationState): SectionNavigationState {
  return {
    ...state,
    activeSection: null,
    categoriesOpen: false,
    mobileSheetOpen: false,
  };
}

export function selectSectionCategory(
  state: SectionNavigationState,
  section: CatalogSection,
  category: string,
  closeMobileSheet = true,
): SectionNavigationState {
  return {
    ...state,
    categoryBySection: {
      ...state.categoryBySection,
      [section]: category || 'Todos',
    },
    mobileSheetOpen: closeMobileSheet ? false : state.mobileSheetOpen,
  };
}

export function toggleCategorySidebar(state: SectionNavigationState): SectionNavigationState {
  return {
    ...state,
    collapsed: !state.collapsed,
  };
}

export function setMobileCategorySheet(
  state: SectionNavigationState,
  open: boolean,
): SectionNavigationState {
  return {
    ...state,
    mobileSheetOpen: open,
  };
}

export function shouldShowCategorySearch(categoryCount: number) {
  return categoryCount >= CATEGORY_SEARCH_THRESHOLD;
}

export function filterCategories(categories: string[], query: string) {
  const term = query.trim().toLocaleLowerCase('pt-BR');
  if (!term) return categories;
  return categories.filter(category => category.toLocaleLowerCase('pt-BR').includes(term));
}

export function categorySidebarWidth(viewportWidth: number) {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return 190;
  return Math.max(176, Math.min(264, Math.round(viewportWidth * 0.17)));
}
