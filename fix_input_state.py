with open("src/App.tsx", "r") as f:
    content = f.read()

import re
replacement = """  const [inputState, setInputState] = useState<{
    isOpen: boolean;
    title: string;
    message: string | React.ReactNode;
    placeholder: string;
    defaultValue?: string;
    type?: 'text' | 'select' | 'password' | 'confirm';
    options?: { label: string; value: string }[];
    onConfirm: (val: string) => void;
    onCancel?: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    placeholder: "",
    onConfirm: () => {},
  });"""

content = re.sub(r'  const \[inputState, setInputState\] = useState<\{\n    isOpen: boolean;\n    title: string;\n    message: string;\n    placeholder: string;\n    defaultValue\?: string;\n    onConfirm: \(val: string\) => void;\n    onCancel\?: \(\) => void;\n  \}>\(\{\n    isOpen: false,\n    title: "",\n    message: "",\n    placeholder: "",\n    onConfirm: \(\) => \{\},\n  \}\);', replacement, content)

with open("src/App.tsx", "w") as f:
    f.write(content)
