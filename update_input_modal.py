import re

with open("src/components/ui/InputModal.tsx", "r") as f:
    content = f.read()

# Add new props to interface
interface_replacement = """interface InputModalProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  placeholder?: string;
  defaultValue?: string;
  type?: 'text' | 'select' | 'password' | 'confirm';
  options?: { label: string; value: string }[];
  onConfirm: (value: string) => void;
  onCancel: () => void;
}"""
content = re.sub(r'interface InputModalProps \{[^}]+\}', interface_replacement, content)

# Update destructuring
destructure_replacement = """export function InputModal({
  isOpen,
  title,
  message,
  placeholder = '',
  defaultValue = '',
  type = 'text',
  options = [],
  onConfirm,
  onCancel
}: InputModalProps) {"""
content = re.sub(r'export function InputModal\(\{\n  isOpen,\n  title,\n  message,\n  placeholder = \'\',\n  defaultValue = \'\',\n  onConfirm,\n  onCancel\n\}: InputModalProps\) \{', destructure_replacement, content)

# Add state for password
state_replacement = """  const [value, setValue] = useState(defaultValue);
  const [showPassword, setShowPassword] = useState(false);"""
content = content.replace("  const [value, setValue] = useState(defaultValue);", state_replacement)

# Update useEffect to reset showPassword
effect_replacement = """  useEffect(() => {
    if (isOpen) {
      setTimeout(() => setValue(defaultValue), 0);
      setShowPassword(false);
    }
  }, [isOpen, defaultValue]);"""
content = re.sub(r'  useEffect\(\(\) => \{\n    if \(isOpen\) \{\n      setTimeout\(\(\) => setValue\(defaultValue\), 0\);\n    \}\n  \}, \[isOpen, defaultValue\]\);', effect_replacement, content)

# Update focus ref
focus_replacement = """  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (type === 'select') {
          selectRef.current?.focus();
        } else if (type !== 'confirm') {
          inputRef.current?.focus();
        }
      }, 0);
    }
  }, [isOpen, type, defaultValue]);"""
content = re.sub(r'  const inputRef = useRef<HTMLInputElement>\(null\);\n\n  useEffect\(\(\) => \{\n    if \(isOpen\) \{\n      setTimeout\(\(\) => \{\n        inputRef\.current\?\.focus\(\);\n      \}, 0\);\n    \}\n  \}, \[isOpen, defaultValue\]\);', focus_replacement, content)

# Add strength logic
strength_logic = """  if (!isOpen) return null;

  let strength = 0;
  if (type === 'password' && value) {
    if (value.length >= 8) strength++;
    if (/[A-Z]/.test(value)) strength++;
    if (/[0-9]/.test(value)) strength++;
    if (/[^A-Za-z0-9]/.test(value)) strength++;
  }"""
content = content.replace("  if (!isOpen) return null;", strength_logic)

# Replace input with conditional rendering
input_replacement = """        {type === 'select' ? (
          <select
            ref={selectRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onConfirm(value);
              } else if (e.key === 'Escape') {
                onCancel();
              }
            }}
            className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 mb-6"
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : type === 'password' ? (
          <div className="relative mb-6">
            <input
              ref={inputRef}
              type={showPassword ? 'text' : 'password'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onConfirm(value);
                } else if (e.key === 'Escape') {
                  onCancel();
                }
              }}
              placeholder={placeholder}
              className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 pr-16"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-2 text-sm text-gray-500 hover:text-gray-700 focus:outline-none"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
            {value && (
              <div className="mt-2 text-xs">
                <div className="flex gap-1 h-1.5 mb-1">
                  {[1, 2, 3, 4].map((level) => (
                    <div
                      key={level}
                      className={`flex-1 rounded-full ${
                        strength >= level
                          ? strength <= 1 ? 'bg-red-500' : strength === 2 ? 'bg-yellow-500' : strength === 3 ? 'bg-blue-500' : 'bg-green-500'
                          : 'bg-gray-200'
                      }`}
                    />
                  ))}
                </div>
                <span className={`${strength <= 1 ? 'text-red-500' : strength === 2 ? 'text-yellow-600' : strength === 3 ? 'text-blue-600' : 'text-green-600'}`}>
                  {strength <= 1 ? 'Weak' : strength === 2 ? 'Fair' : strength === 3 ? 'Good' : 'Strong'}
                </span>
              </div>
            )}
          </div>
        ) : type === 'confirm' ? (
          <div className="mb-6"></div>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onConfirm(value);
              } else if (e.key === 'Escape') {
                onCancel();
              }
            }}
            placeholder={placeholder}
            className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 mb-6"
          />
        )}"""

content = re.sub(r'        <input\n          ref=\{inputRef\}\n          type="text".*?mb-6"\n        />', input_replacement, content, flags=re.DOTALL)

with open("src/components/ui/InputModal.tsx", "w") as f:
    f.write(content)
