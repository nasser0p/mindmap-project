import React from 'react';

interface ChartDataPoint {
    label: string;
    value: number;
}

interface AdminChartProps {
  title: string;
  data: ChartDataPoint[];
}

const AdminChart: React.FC<AdminChartProps> = ({ title, data }) => {
    const maxValue = Math.max(...data.map(d => d.value), 1); // Ensure maxValue is at least 1 to avoid division by zero
    const yAxisTicks = 5;

    return (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 h-full flex flex-col">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">{title}</h3>
            <div className="flex-grow flex gap-4 text-xs text-slate-500 dark:text-slate-400">
                {/* Y-Axis */}
                <div className="flex flex-col justify-between text-right">
                    {Array.from({ length: yAxisTicks + 1 }).map((_, i) => {
                        const value = Math.round(maxValue * (1 - i / yAxisTicks));
                        return <span key={i}>{value}</span>;
                    })}
                </div>

                {/* Chart Area */}
                <div className="flex-grow grid grid-cols-1 relative">
                    {/* Background Lines */}
                    {Array.from({ length: yAxisTicks }).map((_, i) => (
                         <div key={i} className="border-t border-slate-200 dark:border-slate-700/80" style={{ gridRowStart: i + 1 }}></div>
                    ))}

                    {/* Bars */}
                    <div className="absolute inset-0 grid grid-cols-30 gap-2 items-end">
                        {data.slice(-30).map((point, index) => (
                            <div
                                key={index}
                                className="bg-blue-400/80 hover:bg-blue-500 rounded-t-sm transition-colors group relative"
                                style={{ height: `${(point.value / maxValue) * 100}%` }}
                            >
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-2 py-1 bg-slate-900 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                    <strong>{point.value}</strong> on {point.label}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mt-2 pl-8">
                <span>{data[0]?.label || '30 days ago'}</span>
                <span>Today</span>
            </div>
        </div>
    );
};

export default AdminChart;