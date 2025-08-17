import React from 'react';

interface ToolbarProps {
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomToFit: () => void;
  zoomLevel: number;
  isSaving: boolean;
}

const ToolbarButton: React.FC<{ icon: string; onClick: () => void; disabled?: boolean; title: string; }> = ({ icon, onClick, disabled, title }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className="w-9 h-9 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
  >
    <i className={`fa-solid ${icon}`}></i>
  </button>
);

const Toolbar: React.FC<ToolbarProps> = ({
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onZoomIn,
  onZoomOut,
  onZoomToFit,
  zoomLevel,
  isSaving,
}) => {
  return (
    <div className="absolute top-28 left-6 z-20 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md rounded-lg shadow-lg p-1 flex items-center gap-1 border border-slate-200/80 dark:border-slate-700/80">
      <ToolbarButton icon="fa-undo" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)" />
      <ToolbarButton icon="fa-redo" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)" />
      
      <div className="w-px h-6 bg-slate-300 dark:bg-slate-600 mx-1"></div>
      
      <ToolbarButton icon="fa-search-minus" onClick={onZoomOut} title="Zoom Out" />
      <button onClick={onZoomToFit} className="px-3 h-9 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md" title="Fit to Screen">
        {Math.round(zoomLevel * 100)}%
      </button>
      <ToolbarButton icon="fa-search-plus" onClick={onZoomIn} title="Zoom In" />
      
      <div className="w-px h-6 bg-slate-300 dark:bg-slate-600 mx-1"></div>
      
      <div className="flex items-center gap-2 px-3 text-sm text-slate-500 dark:text-slate-400" title="Save Status">
        {isSaving ? (
            <>
                <i className="fa-solid fa-spinner fa-spin"></i>
                <span>Saving...</span>
            </>
        ) : (
            <>
                <i className="fa-solid fa-check-circle text-green-500 dark:text-green-400"></i>
                <span>Saved</span>
            </>
        )}
      </div>
    </div>
  );
};

export default Toolbar;