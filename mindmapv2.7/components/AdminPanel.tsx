import React, { useState, useMemo, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useAdminData, { GlobalStats, UserStat } from '../hooks/useAdminData';
import { db, storage, auth } from '../firebase';
import type { User } from '../firebase';
import { MindMapDocument, Feedback, FeedbackStatus, FeedbackCategory } from '../types';
import Spinner from './Spinner';

const AdminChart = lazy(() => import('./AdminChart'));

type AdminView = 'dashboard' | 'users' | 'content' | 'analytics' | 'feedback';

const StatCard: React.FC<{ title: string; value: string | number; icon: string; }> = ({ title, value, icon }) => (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-500 text-2xl">
            <i className={`fa-solid ${icon}`}></i>
        </div>
        <div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
            <p className="text-3xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
        </div>
    </div>
);

const AdminPanel: React.FC<{ user: User, theme: 'light' | 'dark', onToggleTheme: () => void }> = ({ user, theme, onToggleTheme }) => {
    const [view, setView] = useState<AdminView>('dashboard');
    const { documents, feedback, userStats, globalStats, loading, error } = useAdminData();

    const NavItem: React.FC<{ name: string; icon: string; id: AdminView; count?: number }> = ({ name, icon, id, count }) => (
        <button
            onClick={() => setView(id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-semibold transition-colors ${
                view === id
                    ? 'bg-blue-500 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
        >
            <i className={`fa-solid ${icon} w-5 text-center`}></i>
            <span className="flex-1 text-left">{name}</span>
            {count !== undefined && count > 0 && (
                <span className={`px-2 py-0.5 text-xs rounded-full ${view === id ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700'}`}>{count}</span>
            )}
        </button>
    );
    
    const newFeedbackCount = useMemo(() => feedback.filter(f => f.status === 'new').length, [feedback]);

    const renderContent = () => {
        if (loading) {
            return <div className="flex items-center justify-center h-full"><Spinner fullScreen={false} /></div>;
        }
        if (error) {
            return <div className="p-8 text-center text-red-500">{error}</div>;
        }

        switch (view) {
            case 'dashboard':
                return <DashboardView stats={globalStats} />;
            case 'users':
                return <UserManagementView users={userStats} />;
            case 'content':
                return <ContentManagementView documents={documents} />;
            case 'analytics':
                return <AnalyticsView stats={globalStats} />;
            case 'feedback':
                return <FeedbackManagementView feedbackItems={feedback} />;
            default:
                return <div>Select a view</div>;
        }
    };

    return (
        <div className="w-full h-full flex bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-100">
            {/* Sidebar */}
            <aside className="w-64 h-full bg-white dark:bg-slate-800 flex-shrink-0 flex flex-col p-4 border-r border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3 px-2 mb-8">
                    <i className="fa-solid fa-shield-halved text-2xl text-blue-500"></i>
                    <h1 className="text-xl font-bold">Admin Panel</h1>
                </div>
                <nav className="flex flex-col gap-2">
                    <NavItem name="Dashboard" icon="fa-chart-pie" id="dashboard" />
                    <NavItem name="Analytics" icon="fa-magnifying-glass-chart" id="analytics" />
                    <NavItem name="Users" icon="fa-users" id="users" />
                    <NavItem name="Content" icon="fa-sitemap" id="content" />
                    <NavItem name="Feedback" icon="fa-inbox" id="feedback" count={newFeedbackCount} />
                </nav>
                <div className="mt-auto">
                    <div className="p-2 border-t border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                            <img src={user.photoURL || undefined} alt="Admin" className="w-10 h-10 rounded-full" referrerPolicy="no-referrer" />
                            <div>
                                <p className="font-semibold truncate">{user.displayName}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
                            </div>
                        </div>
                        <div className="mt-4 flex gap-2">
                             <button
                                onClick={onToggleTheme}
                                className="h-9 flex-1 flex items-center justify-center text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-md"
                                title="Toggle Theme"
                            >
                                <i className={`fa-solid ${theme === 'light' ? 'fa-moon' : 'fa-sun'}`}></i>
                            </button>
                            <button
                                onClick={() => auth.signOut()}
                                className="h-9 flex-1 flex items-center justify-center text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-md"
                                title="Sign Out"
                            >
                                <i className="fa-solid fa-arrow-right-from-bracket"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </aside>
            {/* Main Content */}
            <main className="flex-1 h-full overflow-y-auto">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={view}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.2 }}
                        className="p-8"
                    >
                        {renderContent()}
                    </motion.div>
                </AnimatePresence>
            </main>
        </div>
    );
};

const DashboardView: React.FC<{ stats: GlobalStats }> = ({ stats }) => (
    <div>
        <h2 className="text-3xl font-bold mb-6">Dashboard</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-6">
            <StatCard title="Total Users" value={stats.totalUsers} icon="fa-users" />
            <StatCard title="Total Subjects" value={stats.totalDocuments} icon="fa-sitemap" />
            <StatCard title="AI-Generated Maps" value={`${(stats.aiMapRatio * 100).toFixed(1)}%`} icon="fa-wand-magic-sparkles" />
            <StatCard title="Exam Feature Adoption" value={`${(stats.examAdoptionRate * 100).toFixed(1)}%`} icon="fa-graduation-cap" />
        </div>
        <div className="h-[400px]">
            <Suspense fallback={<div className="w-full h-full bg-slate-200 dark:bg-slate-800 animate-pulse rounded-xl" />}>
                <AdminChart title="Subjects Created (Last 30 Days)" data={stats.subjectsPerDay} />
            </Suspense>
        </div>
    </div>
);

const UserManagementView: React.FC<{ users: UserStat[] }> = ({ users }) => {
    return (
        <div>
            <h2 className="text-3xl font-bold mb-6">User Management</h2>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 dark:bg-slate-700/50 text-xs uppercase text-slate-500 dark:text-slate-400">
                        <tr>
                            <th className="p-4">User ID</th>
                            <th className="p-4 text-center">Subjects</th>
                            <th className="p-4 text-center">Total Nodes</th>
                            <th className="p-4">Last Active</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.sort((a,b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime()).map(user => (
                            <tr key={user.uid} className="border-b border-slate-200 dark:border-slate-700">
                                <td className="p-4 font-mono text-xs">{user.uid}</td>
                                <td className="p-4 text-center font-semibold">{user.docCount}</td>
                                <td className="p-4 text-center font-semibold">{user.totalNodes}</td>
                                <td className="p-4">{new Date(user.lastActive).toLocaleDateString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const ContentManagementView: React.FC<{ documents: MindMapDocument[] }> = ({ documents }) => {
    return (
        <div>
            <h2 className="text-3xl font-bold mb-6">Content Management</h2>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 dark:bg-slate-700/50 text-xs uppercase text-slate-500 dark:text-slate-400">
                        <tr>
                            <th className="p-4">Subject Name</th>
                            <th className="p-4">Owner ID</th>
                            <th className="p-4">Created At</th>
                            <th className="p-4 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                         {documents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(doc => (
                            <tr key={doc.id} className="border-b border-slate-200 dark:border-slate-700">
                                <td className="p-4 font-semibold">{doc.name}</td>
                                <td className="p-4 font-mono text-xs">{doc.ownerId}</td>
                                <td className="p-4">{new Date(doc.createdAt).toLocaleString()}</td>
                                <td className="p-4 text-center">
                                     <button disabled className="px-3 py-1 text-xs font-semibold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-full opacity-50 cursor-not-allowed">View Map</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const AnalyticsView: React.FC<{ stats: GlobalStats }> = ({ stats }) => {
    return (
        <div>
            <h2 className="text-3xl font-bold mb-6">Platform Analytics</h2>
            <div className="grid grid-cols-1 gap-6">
                <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-md border border-slate-200 dark:border-slate-700">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">Most Popular Subjects</h3>
                    <ul className="space-y-3">
                        {stats.popularTopics.map((topic, index) => (
                             <li key={index} className="flex justify-between items-center text-sm">
                                <span className="font-medium text-slate-700 dark:text-slate-200">{index + 1}. {topic.name}</span>
                                <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-full font-semibold">{topic.count}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
};

const categoryDisplay: Record<FeedbackCategory, { icon: string, color: string, text: string }> = {
    bug: { icon: 'fa-bug', color: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300', text: 'Bug Report' },
    feature: { icon: 'fa-lightbulb', color: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300', text: 'Feature' },
    general: { icon: 'fa-star', color: 'bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300', text: 'General' },
};

const statusDisplay: Record<FeedbackStatus, { color: string, text: string }> = {
    new: { color: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300', text: 'New' },
    'in-progress': { color: 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300', text: 'In Progress' },
    resolved: { color: 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300', text: 'Resolved' },
    archived: { color: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300', text: 'Archived' },
};


const FeedbackManagementView: React.FC<{ feedbackItems: Feedback[] }> = ({ feedbackItems }) => {
    const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);

    const updateStatus = async (id: string, status: FeedbackStatus) => {
        try {
            await db.collection('feedback').doc(id).update({ status });
            if(selectedFeedback?.id === id) {
                setSelectedFeedback(prev => prev ? {...prev, status} : null);
            }
        } catch (error) {
            console.error("Failed to update feedback status:", error);
            alert("Error: Could not update status.");
        }
    };

    const deleteFeedback = async (feedback: Feedback) => {
        if (!window.confirm("Are you sure you want to permanently delete this feedback?")) return;
        try {
            if (feedback.storagePath) {
                await storage.ref(feedback.storagePath).delete();
            }
            await db.collection('feedback').doc(feedback.id).delete();
            setSelectedFeedback(null);
        } catch (error) {
            console.error("Failed to delete feedback:", error);
            alert("Error: Could not delete feedback item.");
        }
    };

    return (
        <div>
            <h2 className="text-3xl font-bold mb-6">Feedback Inbox</h2>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 overflow-hidden">
                <table className="w-full text-sm text-left">
                     <thead className="bg-slate-50 dark:bg-slate-700/50 text-xs uppercase text-slate-500 dark:text-slate-400">
                        <tr>
                            <th className="p-4">Category</th>
                            <th className="p-4">Summary</th>
                            <th className="p-4">Date</th>
                            <th className="p-4">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {feedbackItems.map(item => (
                            <tr key={item.id} onClick={() => setSelectedFeedback(item)} className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer">
                                <td className="p-4">
                                    <span className={`px-2 py-1 text-xs font-semibold rounded-full flex items-center gap-2 w-max ${categoryDisplay[item.category].color}`}>
                                        <i className={`fa-solid ${categoryDisplay[item.category].icon}`}></i>{categoryDisplay[item.category].text}
                                    </span>
                                </td>
                                <td className="p-4 font-medium max-w-sm truncate">{item.summary}</td>
                                <td className="p-4">{new Date(item.timestamp).toLocaleDateString()}</td>
                                <td className="p-4">
                                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusDisplay[item.status].color}`}>{statusDisplay[item.status].text}</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <AnimatePresence>
                {selectedFeedback && (
                    <FeedbackDetailModal feedback={selectedFeedback} onClose={() => setSelectedFeedback(null)} onUpdateStatus={updateStatus} onDelete={deleteFeedback} />
                )}
            </AnimatePresence>
        </div>
    );
};

const FeedbackDetailModal: React.FC<{ feedback: Feedback, onClose: () => void, onUpdateStatus: (id: string, status: FeedbackStatus) => void, onDelete: (feedback: Feedback) => void }> = ({ feedback, onClose, onUpdateStatus, onDelete }) => (
    <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
    >
        <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-4xl max-h-[90vh] glass-effect rounded-xl flex flex-col"
        >
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center flex-shrink-0">
                <h3 className="font-bold text-lg">{feedback.summary}</h3>
                <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
                    <i className="fa-solid fa-times"></i>
                </button>
            </div>
            <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 p-6 overflow-y-auto">
                    <h4 className="font-semibold mb-2">Description</h4>
                    <p className="text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{feedback.description}</p>
                </div>
                <div className="w-80 border-l border-slate-200 dark:border-slate-700 p-6 flex-shrink-0 flex flex-col gap-6">
                    <div>
                        <h4 className="font-semibold text-sm mb-2">Details</h4>
                        <div className="text-xs space-y-1 text-slate-500 dark:text-slate-400">
                            <p><strong>User:</strong> <span className="font-mono">{feedback.userId}</span></p>
                            <p><strong>Date:</strong> {new Date(feedback.timestamp).toLocaleString()}</p>
                            <p><strong>Platform:</strong> {feedback.clientInfo.platform}</p>
                            <p><strong>Screen:</strong> {feedback.clientInfo.screenWidth}x{feedback.clientInfo.screenHeight}</p>
                        </div>
                    </div>
                    {feedback.screenshotUrl && (
                        <div>
                            <h4 className="font-semibold text-sm mb-2">Screenshot</h4>
                            <a href={feedback.screenshotUrl} target="_blank" rel="noopener noreferrer">
                                <img src={feedback.screenshotUrl} alt="User feedback screenshot" className="rounded-md border border-slate-300 dark:border-slate-600 w-full hover:ring-2 ring-blue-500" />
                            </a>
                        </div>
                    )}
                    <div>
                        <h4 className="font-semibold text-sm mb-2">Status</h4>
                        <select
                            value={feedback.status}
                            onChange={(e) => onUpdateStatus(feedback.id, e.target.value as FeedbackStatus)}
                            className="w-full p-2 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            {Object.keys(statusDisplay).map(s => (
                                <option key={s} value={s}>{statusDisplay[s as FeedbackStatus].text}</option>
                            ))}
                        </select>
                    </div>
                    <div className="mt-auto">
                        <button
                            onClick={() => onDelete(feedback)}
                            className="w-full py-2 bg-red-50 text-red-600 font-semibold rounded-md hover:bg-red-100 dark:bg-red-900/50 dark:text-red-300 dark:hover:bg-red-900"
                        >
                            <i className="fa-solid fa-trash-can mr-2"></i>Delete Feedback
                        </button>
                    </div>
                </div>
            </div>
        </motion.div>
    </motion.div>
);

export default AdminPanel;