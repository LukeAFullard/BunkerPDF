import { useState, useRef, useEffect } from 'react';
import { Play, Plus, Trash2, Settings2, Download, Upload } from 'lucide-react';
import { useRecipeStore, type WorkflowRecipe, type RecipeAction } from '../../store/recipeStore';
import { cn } from '../../lib/utils';
import { useFileStore } from '../../store/fileStore';

export function RecipeMenu({ onApplyRecipe }: { onApplyRecipe: (recipe: WorkflowRecipe) => Promise<void> }) {
  const { recipes, isLoaded, loadRecipes, addRecipe, removeRecipe } = useRecipeStore();
  const [isOpen, setIsOpen] = useState(false);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const documents = useFileStore(state => state.documents);

  useEffect(() => {
    if (!isLoaded) {
      loadRecipes();
    }
  }, [isLoaded, loadRecipes]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleExport = (recipe: WorkflowRecipe, e: React.MouseEvent) => {
    e.stopPropagation();
    const blob = new Blob([JSON.stringify(recipe, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recipe-${recipe.name.toLowerCase().replace(/\s+/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const recipe = JSON.parse(content) as WorkflowRecipe;

        if (!recipe.id || !recipe.name || !Array.isArray(recipe.steps)) {
          throw new Error('Invalid recipe format');
        }

        // Generate a new ID to avoid conflicts
        await addRecipe({
          ...recipe,
          id: `recipe-${Date.now()}`
        });
      } catch (err) {
        console.error('Failed to import recipe:', err);
        alert('Failed to import recipe. The file might be corrupted or in an invalid format.');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const applyRecipe = async (recipe: WorkflowRecipe) => {
    setIsOpen(false);
    await onApplyRecipe(recipe);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
          isOpen ? "bg-blue-50 text-blue-700" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
        )}
      >
        <Settings2 size={18} />
        Recipes
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 left-0 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden flex flex-col">
          <div className="p-3 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
            <h3 className="font-semibold text-gray-800">Workflow Recipes</h3>
            <div className="flex gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-1 text-gray-500 hover:text-blue-600 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                title="Import Recipe"
              >
                <Upload size={16} />
              </button>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".json"
                onChange={handleImport}
              />
              <button
                onClick={() => setIsBuilderOpen(true)}
                className="p-1 text-gray-500 hover:text-green-600 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                title="Create Recipe"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {recipes.length === 0 ? (
              <div className="p-6 text-center text-gray-500 text-sm">
                No recipes found. Create one to automate your workflows!
              </div>
            ) : (
              <div className="flex flex-col">
                {recipes.map((recipe) => (
                  <div key={recipe.id} className="p-3 border-b border-gray-50 hover:bg-gray-50 group flex flex-col gap-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium text-gray-800 text-sm">{recipe.name}</h4>
                        {recipe.description && (
                          <p className="text-xs text-gray-500 mt-0.5">{recipe.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => handleExport(recipe, e)}
                          className="p-1 text-gray-400 hover:text-blue-600 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                          title="Export"
                        >
                          <Download size={14} />
                        </button>
                        <button
                          onClick={() => removeRecipe(recipe.id)}
                          className="p-1 text-gray-400 hover:text-red-600 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex flex-wrap gap-1 flex-1">
                        {recipe.steps.map((step, idx) => (
                          <span key={idx} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                            {step}
                          </span>
                        ))}
                      </div>
                      <button
                        onClick={() => applyRecipe(recipe)}
                        disabled={documents.length === 0}
                        className="flex-shrink-0 flex items-center gap-1 bg-blue-100 text-blue-700 hover:bg-blue-200 px-2 py-1 rounded text-xs font-medium disabled:opacity-50 transition-colors"
                      >
                        <Play size={12} />
                        Run
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {isBuilderOpen && (
        <RecipeBuilderModal
          onClose={() => setIsBuilderOpen(false)}
          onSave={async (recipe) => {
            await addRecipe(recipe);
            setIsBuilderOpen(false);
          }}
        />
      )}
    </div>
  );
}

function RecipeBuilderModal({ onClose, onSave }: { onClose: () => void, onSave: (recipe: WorkflowRecipe) => Promise<void> }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<RecipeAction[]>([]);

  const availableActions: RecipeAction[] = [
    'ocr', 'redact', 'sanitize',
    'extract-tables', 'extract-images', 'extract-text'
  ];

  const handleSave = () => {
    if (!name.trim() || steps.length === 0) return;

    onSave({
      id: `recipe-${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      steps
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">Create Recipe</h2>
          <p className="text-sm text-gray-500">Automate your document processing workflow.</p>
        </div>

        <div className="p-4 flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Recipe Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="e.g., Clean & Compress"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="e.g., OCR, then sanitize"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Workflow Steps</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {availableActions.map(action => (
                <button
                  key={action}
                  onClick={() => setSteps([...steps, action])}
                  className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs rounded border border-gray-200"
                >
                  + {action}
                </button>
              ))}
            </div>

            <div className="min-h-[100px] border border-dashed border-gray-300 rounded-lg p-3 bg-gray-50">
              {steps.length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-4">
                  Click actions above to add them to your workflow sequence.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {steps.map((step, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-white p-2 border border-gray-200 rounded text-sm shadow-sm">
                      <div className="flex items-center gap-2">
                        <span className="bg-blue-100 text-blue-800 text-xs font-bold px-1.5 py-0.5 rounded">{idx + 1}</span>
                        <span className="font-medium text-gray-700">{step}</span>
                      </div>
                      <button
                        onClick={() => setSteps(steps.filter((_, i) => i !== idx))}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || steps.length === 0}
            className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            Save Recipe
          </button>
        </div>
      </div>
    </div>
  );
}
