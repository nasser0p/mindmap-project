import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Auth from './Auth';

const Nav: React.FC<{ onLogin: () => void }> = ({ onLogin }) => (
  <nav className="absolute top-0 left-0 right-0 z-10 p-4">
    <div className="container mx-auto flex justify-between items-center">
      <div className="flex items-center gap-2">
        <i className="fa-solid fa-sitemap text-2xl text-white"></i>
        <span className="text-xl font-bold text-white">MindMaster AI</span>
      </div>
      <button 
        onClick={onLogin} 
        className="px-4 py-2 text-sm font-semibold text-white bg-white/10 rounded-full hover:bg-white/20 transition-colors"
      >
        Sign In
      </button>
    </div>
  </nav>
);

const FeatureCard: React.FC<{ icon: string, title: string, children: React.ReactNode, delay: number }> = ({ icon, title, children, delay }) => (
    <motion.div 
        className="p-8 rounded-2xl bg-slate-800/50 border border-slate-700/80 feature-card-hover flex flex-col"
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.5, delay: delay * 0.2 }}
    >
        <div className="w-12 h-12 rounded-full bg-sky-500/10 flex items-center justify-center mb-4 border border-sky-500/20 flex-shrink-0">
            <i className={`fa-solid ${icon} text-sky-400 text-xl`}></i>
        </div>
        <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
        <p className="text-slate-400 leading-relaxed">{children}</p>
        
        {/* Visual Demo Placeholder */}
        <div className="mt-6 pt-4 border-t border-slate-700/50 flex-grow flex items-center justify-center">
            {title.includes('Automate') && (
                <div className="flex items-center gap-4 text-slate-500">
                    <i className="fa-solid fa-file-pdf text-3xl"></i>
                    <i className="fa-solid fa-arrow-right-long text-xl text-sky-500"></i>
                    <i className="fa-solid fa-sitemap text-4xl"></i>
                </div>
            )}
            {title.includes('Master') && (
                 <div className="flex items-center gap-4 text-slate-500">
                    <i className="fa-solid fa-graduation-cap text-3xl"></i>
                    <i className="fa-solid fa-arrow-right-long text-xl text-sky-500"></i>
                    <div className="flex items-center gap-2">
                        <i className="fa-solid fa-circle-check text-3xl text-green-500"></i>
                        <span className="font-bold text-lg text-white">95%</span>
                    </div>
                </div>
            )}
            {title.includes('Tutor') && (
                <div className="flex items-center gap-2 text-slate-500">
                    <i className="fa-solid fa-robot text-3xl"></i>
                    <div className="text-left text-xs p-2 bg-slate-700/30 rounded-md">
                        <span className="w-2 h-2 bg-sky-500 rounded-full inline-block animate-pulse" style={{ animationDelay: '0s'}}></span>
                        <span className="w-2 h-2 bg-sky-500 rounded-full inline-block animate-pulse ml-1" style={{ animationDelay: '0.2s'}}></span>
                        <span className="w-2 h-2 bg-sky-500 rounded-full inline-block animate-pulse ml-1" style={{ animationDelay: '0.4s'}}></span>
                    </div>
                </div>
            )}
        </div>

    </motion.div>
);

const TestimonialCard: React.FC<{ quote: string, name: string, role: string, avatar: string, delay: number }> = ({ quote, name, role, avatar, delay }) => (
    <motion.div 
        className="p-6 rounded-xl bg-white border border-slate-200 relative overflow-hidden"
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.4, delay: delay * 0.15 }}
    >
        <i className="fa-solid fa-quote-left text-7xl text-slate-100 absolute -top-4 -left-4"></i>
        <p className="text-slate-600 mb-4 italic z-10 relative">"{quote}"</p>
        <div className="flex items-center gap-3 z-10 relative">
            <img src={avatar} alt={name} className="w-10 h-10 rounded-full" />
            <div>
                <div className="font-semibold text-slate-800">{name}</div>
                <div className="text-sm text-slate-500">{role}</div>
            </div>
        </div>
    </motion.div>
);

const LandingPage: React.FC = () => {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  return (
    <div className="bg-white text-slate-800 antialiased overflow-x-hidden">
      <AnimatePresence>
        {isAuthModalOpen && <Auth onClose={() => setIsAuthModalOpen(false)} />}
      </AnimatePresence>

      {/* Hero Section */}
      <header className="relative min-h-screen landing-dark-bg text-white flex flex-col items-center justify-center p-4 overflow-hidden shimmer-bg">
        <Nav onLogin={() => setIsAuthModalOpen(true)} />
        <div className="neural-bg absolute inset-0"></div>
        <motion.div 
            className="relative z-10 text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
        >
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tighter mb-4">
                Turn Information into <span className="text-sky-400">Mastery</span>.
            </h1>
            <p className="max-w-3xl mx-auto text-lg md:text-xl text-slate-300 mb-8">
                The AI-native platform to visualize complex subjects, auto-generate mind maps from your documents, create targeted exams, and master anything faster.
            </p>
            <motion.button 
                onClick={() => setIsAuthModalOpen(true)} 
                className="px-8 py-4 bg-sky-500 text-white font-bold rounded-full hover:bg-sky-600 transition-all shadow-lg shadow-sky-500/20"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
            >
                Start Learning for Free
            </motion.button>
        </motion.div>
      </header>

      <main>
        {/* Transformation Section */}
        <section className="py-20 lg:py-32 bg-slate-50">
            <div className="container mx-auto px-4 text-center">
                <h2 className="text-3xl lg:text-4xl font-bold text-slate-800 mb-4">From Clutter to Clarity, Instantly.</h2>
                <p className="text-lg text-slate-500 mb-12 max-w-3xl mx-auto">Stop drowning in notes and dense documents. Let AI do the heavy lifting, turning scattered information into a structured, visual knowledge map.</p>
                <motion.div 
                    className="grid md:grid-cols-3 gap-8 items-center"
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, amount: 0.2 }}
                    transition={{ staggerChildren: 0.2 }}
                >
                    <motion.div variants={{ hidden: { opacity: 0, x: -50 }, visible: { opacity: 1, x: 0 } }} className="p-6 rounded-xl bg-white border border-slate-200">
                        <div className="text-4xl mb-3">📚</div>
                        <h3 className="font-bold mb-1">Your Documents</h3>
                        <p className="text-sm text-slate-500">Textbooks, PDFs, and lecture notes.</p>
                    </motion.div>
                    <motion.div variants={{ hidden: { opacity: 0, scale: 0.5 }, visible: { opacity: 1, scale: 1 } }} className="text-5xl text-sky-500">
                        <i className="fa-solid fa-arrow-right-long"></i>
                    </motion.div>
                    <motion.div variants={{ hidden: { opacity: 0, x: 50 }, visible: { opacity: 1, x: 0 } }} className="p-6 rounded-xl bg-white border border-slate-200 shadow-2xl shadow-sky-500/10">
                         <div className="text-4xl mb-3">✨</div>
                        <h3 className="font-bold mb-1">Instant Knowledge Map</h3>
                        <p className="text-sm text-slate-500">A structured, interactive map, ready to explore.</p>
                    </motion.div>
                </motion.div>
            </div>
        </section>

        {/* Features Section */}
        <section className="py-20 lg:py-32 landing-dark-bg text-white shimmer-bg">
            <div className="container mx-auto px-4">
                <div className="text-center mb-12">
                     <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">Your Integrated Learning System</h2>
                     <p className="text-lg text-slate-400 max-w-3xl mx-auto">MindMaster AI is more than a tool—it guides you through the entire learning lifecycle.</p>
                </div>
                <div className="grid md:grid-cols-1 lg:grid-cols-3 gap-8">
                    <FeatureCard icon="fa-file-import" title="Automate Your Knowledge Base" delay={0}>
                        Stop summarizing, start understanding. Upload any PDF or text file and watch our AI transform it into a rich, multi-level mind map, complete with summaries for every concept.
                    </FeatureCard>
                     <FeatureCard icon="fa-graduation-cap" title="Learn, Test, and Master" delay={1}>
                        Generate custom exams from your map's content. Get instant AI grading and see nodes glow for topics you need to review. Track your progress with a real-time mastery score.
                    </FeatureCard>
                    <FeatureCard icon="fa-robot" title="Your Personal AI Tutor" delay={2}>
                        Chat with an AI that understands the context of your notes. Ask questions, request timed study sprints, and get proactive help from our 'Eureka Bot' when you're struggling.
                    </FeatureCard>
                </div>
            </div>
        </section>

        {/* Testimonials Section */}
        <section className="py-20 lg:py-32 bg-slate-50">
            <div className="container mx-auto px-4">
                <div className="text-center mb-12">
                     <h2 className="text-3xl lg:text-4xl font-bold text-slate-800 mb-4">Learn Smarter, Not Harder</h2>
                </div>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                    <TestimonialCard 
                        quote="I uploaded a 60-page research paper and got a navigable mind map in minutes. This saved me hours and helped me ace my presentation. It's my go-to tool for every project now."
                        name="Mike R."
                        role="Grad Student"
                        avatar="https://randomuser.me/api/portraits/men/32.jpg"
                        delay={0}
                    />
                    <TestimonialCard 
                        quote="The mastery tracker made studying feel like a game. Seeing my score go up after each quiz was so motivating. My grade went from a C+ to an A-."
                        name="Sarah J."
                        role="University Student"
                        avatar="https://randomuser.me/api/portraits/women/44.jpg"
                        delay={1}
                    />
                     <TestimonialCard 
                        quote="As a visual learner, this is a game-changer. The AI Tutor's explanations are clearer than most of my textbooks. 10/10."
                        name="Chloe T."
                        role="High School Student"
                        avatar="https://randomuser.me/api/portraits/women/68.jpg"
                        delay={2}
                    />
                </div>
            </div>
        </section>

        {/* Final CTA */}
        <section className="landing-dark-bg text-white">
             <div className="container mx-auto px-4 py-20 lg:py-32 text-center">
                 <motion.div
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.5 }}
                    transition={{ duration: 0.6 }}
                 >
                    <h2 className="text-3xl lg:text-5xl font-extrabold mb-6">Ready to Build Your Ultimate Knowledge Map?</h2>
                     <motion.button 
                        onClick={() => setIsAuthModalOpen(true)} 
                        className="px-10 py-5 bg-sky-500 text-white font-bold rounded-full hover:bg-sky-600 transition-all shadow-lg shadow-sky-500/20"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        Get Started for Free
                    </motion.button>
                    <p className="mt-4 text-sm text-slate-400">No credit card required. Free forever plan.</p>
                </motion.div>
             </div>
        </section>
      </main>

       <footer className="bg-slate-900 text-slate-400 py-8">
          <div className="container mx-auto px-4 text-center text-sm">
            <p>&copy; {new Date().getFullYear()} MindMaster AI. All rights reserved.</p>
          </div>
        </footer>
    </div>
  );
};

export default LandingPage;