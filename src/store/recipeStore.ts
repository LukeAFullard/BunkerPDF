import { create } from 'zustand';
import { get, set as idbSet } from 'idb-keyval';

export type RecipeAction =
  | 'merge'
  | 'split'
  | 'rotate'
  | 'watermark'
  | 'optimize'
  | 'ocr'
  | 'redact'
  | 'sanitize'
  | 'flatten'
  | 'extract-tables'
  | 'extract-text'
  | 'extract-images';

export interface WorkflowRecipe {
  id: string;
  name: string;
  description?: string;
  steps: RecipeAction[];
}

interface RecipeStore {
  recipes: WorkflowRecipe[];
  isLoaded: boolean;
  loadRecipes: () => Promise<void>;
  addRecipe: (recipe: WorkflowRecipe) => Promise<void>;
  removeRecipe: (id: string) => Promise<void>;
  updateRecipe: (id: string, updates: Partial<WorkflowRecipe>) => Promise<void>;
}

const RECIPES_KEY = 'bunkerpdf_recipes_v1';

export const useRecipeStore = create<RecipeStore>((set, getStore) => ({
  recipes: [],
  isLoaded: false,
  loadRecipes: async () => {
    try {
      const data = await get(RECIPES_KEY);
      if (data) {
        set({ recipes: data, isLoaded: true });
      } else {
        set({ isLoaded: true });
      }
    } catch (e) {
      console.error('Failed to load recipes', e);
      set({ isLoaded: true });
    }
  },
  addRecipe: async (recipe) => {
    const current = getStore().recipes;
    const newRecipes = [...current, recipe];
    set({ recipes: newRecipes });
    await idbSet(RECIPES_KEY, newRecipes);
  },
  removeRecipe: async (id) => {
    const current = getStore().recipes;
    const newRecipes = current.filter(r => r.id !== id);
    set({ recipes: newRecipes });
    await idbSet(RECIPES_KEY, newRecipes);
  },
  updateRecipe: async (id, updates) => {
    const current = getStore().recipes;
    const newRecipes = current.map(r => r.id === id ? { ...r, ...updates } : r);
    set({ recipes: newRecipes });
    await idbSet(RECIPES_KEY, newRecipes);
  }
}));
