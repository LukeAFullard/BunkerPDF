import fs from 'fs';

let content = fs.readFileSync('src/components/pdf/reorder/CrossDocumentReorder.tsx', 'utf-8');

// Add DroppableContainer component above CrossDocumentReorder
const droppableContainerCode = `
interface DroppableContainerProps {
  id: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

function DroppableContainer({ id, children, className, style }: DroppableContainerProps) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={className} style={style}>
      {children}
    </div>
  );
}

`;

content = content.replace("export function CrossDocumentReorder", droppableContainerCode + "export function CrossDocumentReorder");

fs.writeFileSync('src/components/pdf/reorder/CrossDocumentReorder.tsx', content);
