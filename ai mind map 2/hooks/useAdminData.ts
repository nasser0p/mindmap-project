import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { MindMapDocument, MindMapNode } from '../types';

export interface UserStat {
    uid: string;
    docCount: number;
    totalNodes: number;
    lastActive: string;
}

export interface ChartDataPoint {
    label: string;
    value: number;
}

export interface PopularTopic {
    name: string;
    count: number;
}

export interface GlobalStats {
    totalUsers: number;
    totalDocuments: number;
    totalNodes: number;
    subjectsPerDay: ChartDataPoint[];
    aiMapRatio: number;
    examAdoptionRate: number;
    popularTopics: PopularTopic[];
}

const countNodes = (node: MindMapNode): number => {
    let count = 1;
    if (node.children) {
        for (const child of node.children) {
            count += countNodes(child);
        }
    }
    return count;
};

const hasMasteryScore = (node: MindMapNode): boolean => {
    if (node.masteryScore > 0) return true;
    if (node.children) {
        for (const child of node.children) {
            if (hasMasteryScore(child)) return true;
        }
    }
    return false;
}

const useAdminData = () => {
    const [documents, setDocuments] = useState<MindMapDocument[]>([]);
    const [userStats, setUserStats] = useState<UserStat[]>([]);
    const [globalStats, setGlobalStats] = useState<GlobalStats>({
        totalUsers: 0,
        totalDocuments: 0,
        totalNodes: 0,
        subjectsPerDay: [],
        aiMapRatio: 0,
        examAdoptionRate: 0,
        popularTopics: [],
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        setError(null);

        const unsubscribe = db.collection('documents').onSnapshot(snapshot => {
            const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MindMapDocument));
            setDocuments(docs);

            // Process stats
            const userMap = new Map<string, { docCount: number; totalNodes: number; lastActive: string; tookExam: boolean; }>();
            let totalNodesCount = 0;
            let aiMapCount = 0;
            const topicCounts: Record<string, number> = {};

            // --- Time Series Data (Subjects per day for last 30 days) ---
            const subjectsPerDayMap = new Map<string, number>();
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            for (let i = 0; i < 30; i++) {
                const date = new Date(today);
                date.setDate(today.getDate() - i);
                const dateString = date.toLocaleDateString('en-CA'); // YYYY-MM-DD
                subjectsPerDayMap.set(dateString, 0);
            }

            docs.forEach(doc => {
                const user = userMap.get(doc.ownerId) || { docCount: 0, totalNodes: 0, lastActive: '1970-01-01T00:00:00Z', tookExam: false };
                user.docCount++;
                const nodesInDoc = countNodes(doc.root);
                user.totalNodes += nodesInDoc;
                totalNodesCount += nodesInDoc;

                if (doc.createdAt > user.lastActive) {
                    user.lastActive = doc.createdAt;
                }
                
                if (!user.tookExam && hasMasteryScore(doc.root)) {
                    user.tookExam = true;
                }

                if (doc.sourceDocuments && doc.sourceDocuments.length > 0) {
                    aiMapCount++;
                }
                
                topicCounts[doc.name] = (topicCounts[doc.name] || 0) + 1;

                const createdAt = new Date(doc.createdAt);
                const thirtyDaysAgo = new Date(today);
                thirtyDaysAgo.setDate(today.getDate() - 30);
                if (createdAt >= thirtyDaysAgo) {
                    const dateString = createdAt.toLocaleDateString('en-CA');
                    subjectsPerDayMap.set(dateString, (subjectsPerDayMap.get(dateString) || 0) + 1);
                }

                userMap.set(doc.ownerId, user);
            });

            const stats: UserStat[] = Array.from(userMap.entries()).map(([uid, data]) => ({
                uid,
                docCount: data.docCount,
                totalNodes: data.totalNodes,
                lastActive: data.lastActive,
            }));

            const usersWhoTookExam = Array.from(userMap.values()).filter(u => u.tookExam).length;
            
            const subjectsPerDay = Array.from(subjectsPerDayMap.entries())
                .map(([date, count]) => ({ label: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), value: count }))
                .reverse();
            
            const popularTopics = Object.entries(topicCounts)
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 20); // Top 20

            setUserStats(stats);
            setGlobalStats({
                totalUsers: userMap.size,
                totalDocuments: docs.length,
                totalNodes: totalNodesCount,
                subjectsPerDay,
                aiMapRatio: docs.length > 0 ? (aiMapCount / docs.length) : 0,
                examAdoptionRate: userMap.size > 0 ? (usersWhoTookExam / userMap.size) : 0,
                popularTopics,
            });
            setLoading(false);
        }, (err) => {
            console.error("Admin data fetch error:", err);
            setError("Failed to fetch admin data. Check Firestore rules and network connection.");
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    return { documents, userStats, globalStats, loading, error };
};

export default useAdminData;