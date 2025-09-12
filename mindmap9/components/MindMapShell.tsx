import React from 'react';

const ShellNode: React.FC<{ className?: string }> = ({ className = '' }) => (
    <div className={`rounded-2xl bg-slate-200 animate-pulse ${className}`} />
);

const Line: React.FC<{ style: React.CSSProperties }> = ({ style }) => (
     <div className="absolute bg-slate-200 h-0.5 animate-pulse" style={style}></div>
);

const MindMapShell: React.FC = () => {
  return (
    <div className="w-full h-full flex items-center justify-center pointer-events-none" aria-label="Loading mind map...">
      <div className="relative w-[600px] h-[400px]">
        {/* Central Root Node */}
        <ShellNode className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-14 bg-slate-300" />

        {/* Child Nodes */}
        <ShellNode className="absolute top-[15%] left-[10%] w-36 h-12" />
        <ShellNode className="absolute top-[20%] right-[5%] w-40 h-12" />
        <ShellNode className="absolute bottom-[15%] left-[20%] w-32 h-12" />
        <ShellNode className="absolute bottom-[10%] right-[15%] w-36 h-12" />

        {/* Lines */}
        <div className="absolute top-1/2 left-1/2 w-px h-px">
            <Line style={{ width: '120px', transform: 'translate(-140px, -70px) rotate(-30deg)' }} />
            <Line style={{ width: '150px', transform: 'translate(40px, -75px) rotate(35deg)' }} />
            <Line style={{ width: '100px', transform: 'translate(-120px, 70px) rotate(40deg)' }} />
            <Line style={{ width: '130px', transform: 'translate(40px, 70px) rotate(-35deg)' }} />
        </div>
      </div>
    </div>
  );
};

export default MindMapShell;
