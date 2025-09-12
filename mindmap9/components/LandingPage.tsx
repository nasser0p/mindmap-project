import React, { lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import FAQ from './FAQ';

const AnimatedMindMapBackground = lazy(() => import('./AnimatedMindMapBackground'));

const Nav: React.FC<{ onLogin: () => void }> = ({ onLogin }) => (
  <nav className="absolute top-0 left-0 right-0 z-20 p-4">
    <div className="container mx-auto flex justify-between items-center">
      <div className="flex items-center gap-2">
        <i className="fa-solid fa-sitemap text-2xl text-white"></i>
        <span className="text-xl font-bold text-white">MindMaster AI</span>
      </div>
      <button 
        onClick={onLogin} 
        className="px-4 py-2 text-sm font-semibold text-white bg-white/10 rounded-full hover:bg-white/20 backdrop-blur-sm transition-colors"
      >
        Sign In
      </button>
    </div>
  </nav>
);

const HowItWorksStep: React.FC<{ icon: string, title: string, children: React.ReactNode, animation: React.ReactNode }> = ({ icon, title, children, animation }) => (
    <div className="flex flex-col items-center">
        <div className="relative w-24 h-24 mb-4 flex items-center justify-center">
            {animation}
        </div>
        <h3 className="text-xl font-bold text-slate-800 mb-2">{title}</h3>
        <p className="text-slate-500 max-w-xs">{children}</p>
    </div>
);

const FeatureCard: React.FC<{ icon: string, title: string, children: React.ReactNode, delay: number, demo: React.ReactNode }> = ({ icon, title, children, delay, demo }) => (
    <motion.div 
        className="p-8 rounded-2xl bg-slate-800/50 border border-slate-700/80 flex flex-col overflow-hidden"
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
        
        <div className="mt-6 pt-6 border-t border-slate-700/50 flex-grow flex items-center justify-center feature-demo-bg rounded-lg p-4 h-48">
            {demo}
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

const LandingPage: React.FC<{ onGoToLogin: () => void }> = ({ onGoToLogin }) => {

  const faqItems = [
    {
      question: "Is my data private and secure?",
      answer: "Absolutely. Your mind maps and uploaded documents are stored securely using Firebase's robust security rules. Only you can access your own data."
    },
    {
      question: "What file types are supported for AI map generation?",
      answer: "Currently, we support PDF (.pdf) and Plain Text (.txt) files. We are working on expanding support for more formats like Word documents and web pages soon."
    },
    {
      question: "Can I collaborate with others on a mind map?",
      answer: "Real-time collaboration is a top priority on our roadmap! While not available today, we are actively developing features to allow you to share and edit maps with your team or study group."
    },
    {
        question: "Is MindMaster AI really free?",
        answer: "Yes! The core features of MindMaster AI, including unlimited mind maps, AI document analysis, and mastery tracking, are available on our generous free plan. We may introduce premium features for power users in the future."
    }
  ];

  return (
    <div className="bg-white text-slate-800 antialiased overflow-x-hidden">
      {/* Hero Section */}
      <header className="relative min-h-screen landing-dark-bg text-white flex flex-col items-center justify-center p-4 overflow-hidden">
        <Nav onLogin={onGoToLogin} />
        <Suspense fallback={<div className="absolute inset-0 shimmer-bg" />}>
          <AnimatedMindMapBackground />
        </Suspense>
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-slate-950/20"></div>

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
                Stop drowning in notes. Let AI build your ultimate knowledge map, test your understanding, and guide you to mastery.
            </p>
            <motion.button 
                onClick={onGoToLogin} 
                className="px-8 py-4 bg-sky-500 text-white font-bold rounded-full hover:bg-sky-600 transition-all shadow-lg shadow-sky-500/20"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
            >
                Start Learning for Free
            </motion.button>
        </motion.div>
      </header>

      <main>
        {/* How It Works Section */}
        <section className="py-20 lg:py-32 bg-slate-50">
            <div className="container mx-auto px-4 text-center">
                <h2 className="text-3xl lg:text-4xl font-bold text-slate-800 mb-4">How It Works</h2>
                <p className="text-lg text-slate-500 mb-16 max-w-3xl mx-auto">In three simple steps, transform dense documents into a clear path to understanding.</p>
                <div className="relative grid md:grid-cols-3 gap-8 items-start">
                    <div className="hidden md:block absolute top-12 left-0 right-0 h-0.5 how-it-works-line"></div>
                    <HowItWorksStep
                        icon="fa-upload"
                        title="1. Feed the AI"
                        animation={
                            <motion.div initial={{ scale: 0 }} animate={{ scale: 1, transition: { delay: 0.2, type: 'spring' } }} className="w-24 h-24 rounded-full bg-white border-2 border-slate-200 shadow-lg flex items-center justify-center">
                                <i className="fa-solid fa-file-pdf text-4xl text-red-500"></i>
                            </motion.div>
                        }
                    >
                        Upload your study materials, lecture notes, or any PDF/text document.
                    </HowItWorksStep>
                    <HowItWorksStep
                        icon="fa-sitemap"
                        title="2. Get Your Map"
                        animation={
                             <motion.div initial={{ scale: 0 }} animate={{ scale: 1, transition: { delay: 0.4, type: 'spring' } }} className="w-24 h-24 rounded-full bg-white border-2 border-slate-200 shadow-lg flex items-center justify-center">
                                <i className="fa-solid fa-wand-magic-sparkles text-4xl text-sky-500"></i>
                            </motion.div>
                        }
                    >
                        Our AI analyzes the content and auto-generates a structured, interactive mind map.
                    </HowItWorksStep>
                    <HowItWorksStep
                        icon="fa-graduation-cap"
                        title="3. Achieve Mastery"
                        animation={
                            <motion.div initial={{ scale: 0 }} animate={{ scale: 1, transition: { delay: 0.6, type: 'spring' } }} className="w-24 h-24 rounded-full bg-white border-2 border-slate-200 shadow-lg flex items-center justify-center">
                                <i className="fa-solid fa-circle-check text-4xl text-green-500"></i>
                            </motion.div>
                        }
                    >
                        Take AI-generated exams, track your score, and review weak spots directly on the map.
                    </HowItWorksStep>
                </div>
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
                    <FeatureCard icon="fa-file-import" title="Automate Your Knowledge Base" delay={0} demo={
                        <div className="w-full h-full flex items-center justify-center gap-4 text-slate-400">
                           <i className="fa-solid fa-file-pdf text-5xl"></i>
                           <motion.div initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1, delay: 0.5 }} className="w-12 h-px">
                               <svg width="100%" height="100%"><path d="M 0 0.5 L 48 0.5" stroke="#0ea5e9" strokeWidth="2" /></svg>
                           </motion.div>
                           <i className="fa-solid fa-sitemap text-6xl"></i>
                        </div>
                    }>
                        Stop summarizing, start understanding. Upload any PDF or text file and watch our AI transform it into a rich, multi-level mind map, complete with summaries for every concept.
                    </FeatureCard>
                     <FeatureCard icon="fa-graduation-cap" title="Learn, Test, and Master" delay={1} demo={
                         <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-slate-400 text-sm">
                            <div className="px-3 py-1.5 bg-slate-700 rounded-full font-semibold text-white">🎓 Take Exam</div>
                            <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.8 }} className="w-4 h-4 text-center">↓</motion.div>
                            <motion.div 
                                className="w-24 h-10 bg-slate-700 rounded-lg"
                                animate={{ boxShadow: ['0 0 8px 1px rgba(239, 68, 68, 0.7)', '0 0 12px 3px rgba(239, 68, 68, 0.4)', '0 0 8px 1px rgba(239, 68, 68, 0.7)'] }}
                                transition={{ duration: 1.5, repeat: Infinity, repeatType: 'mirror', delay: 1 }}
                            />
                         </div>
                     }>
                        Generate custom exams from your map's content. Get instant AI grading and see nodes glow for topics you need to review. Track your progress with a real-time mastery score.
                    </FeatureCard>
                    <FeatureCard icon="fa-robot" title="Your Personal AI Tutor" delay={2} demo={
                        <div className="w-full h-full flex flex-col items-start justify-end gap-2 text-slate-400 text-xs">
                           <div className="p-2 bg-slate-700 rounded-lg max-w-[80%] self-end">Explain this simply</div>
                           <div className="p-2 bg-sky-900/50 rounded-lg max-w-[80%] self-start">
                             <span className="w-1.5 h-1.5 bg-sky-400 rounded-full inline-block animate-pulse" style={{ animationDelay: '0s'}}></span>
                             <span className="w-1.5 h-1.5 bg-sky-400 rounded-full inline-block animate-pulse ml-1" style={{ animationDelay: '0.2s'}}></span>
                             <span className="w-1.5 h-1.5 bg-sky-400 rounded-full inline-block animate-pulse ml-1" style={{ animationDelay: '0.4s'}}></span>
                           </div>
                        </div>
                    }>
                        Chat with an AI that understands the context of your notes. Ask questions, request timed study sprints, and get proactive help from our 'Eureka Bot' when you're struggling.
                    </FeatureCard>
                </div>
            </div>
        </section>

        {/* Pricing Section */}
        <section className="py-20 lg:py-32 bg-slate-50">
            <div className="container mx-auto px-4 text-center">
                 <h2 className="text-3xl lg:text-4xl font-bold text-slate-800 mb-4">Simple, Transparent Pricing</h2>
                 <p className="text-lg text-slate-500 mb-12 max-w-3xl mx-auto">Get access to powerful AI learning tools without the complex tiers or hidden fees.</p>
                 <motion.div
                    className="max-w-md mx-auto p-8 bg-white rounded-2xl shadow-2xl shadow-sky-500/10 border border-slate-200"
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.5 }}
                    transition={{ duration: 0.5 }}
                 >
                    <h3 className="text-2xl font-bold text-slate-800">Free Forever</h3>
                    <p className="text-6xl font-extrabold my-4">$0</p>
                    <ul className="space-y-3 text-left text-slate-600 mb-8">
                        <li className="flex items-center gap-3"><i className="fa-solid fa-check-circle text-sky-500"></i><span>Unlimited Mind Maps</span></li>
                        <li className="flex items-center gap-3"><i className="fa-solid fa-check-circle text-sky-500"></i><span>AI Document-to-Map Generation</span></li>
                        <li className="flex items-center gap-3"><i className="fa-solid fa-check-circle text-sky-500"></i><span>AI-Generated Exams & Sprints</span></li>
                        <li className="flex items-center gap-3"><i className="fa-solid fa-check-circle text-sky-500"></i><span>Personal Mastery Score Tracking</span></li>
                        <li className="flex items-center gap-3"><i className="fa-solid fa-check-circle text-sky-500"></i><span>Contextual AI Tutor Chat</span></li>
                    </ul>
                     <button onClick={onGoToLogin} className="w-full py-3 bg-sky-500 text-white font-bold rounded-full hover:bg-sky-600 transition-all">
                        Get Started
                    </button>
                 </motion.div>
            </div>
        </section>

        {/* Testimonials Section */}
        <section className="py-20 lg:py-32 bg-white">
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

        {/* FAQ Section */}
        <section className="py-20 lg:py-32 bg-slate-50">
             <div className="container mx-auto px-4">
                 <div className="text-center mb-12">
                     <h2 className="text-3xl lg:text-4xl font-bold text-slate-800 mb-4">Frequently Asked Questions</h2>
                </div>
                <div className="max-w-3xl mx-auto">
                    <FAQ items={faqItems} />
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
                        onClick={onGoToLogin} 
                        className="px-10 py-5 bg-sky-500 text-white font-bold rounded-full hover:bg-sky-600 transition-all shadow-lg shadow-sky-500/20"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        Get Started for Free
                    </motion.button>
                    <p className="mt-4 text-sm text-slate-400">No credit card required.</p>
                </motion.div>
             </div>
        </section>
      </main>

       <footer className="bg-slate-950 text-slate-400 py-8">
          <div className="container mx-auto px-4 text-center text-sm">
            <p>&copy; {new Date().getFullYear()} MindMaster AI. All rights reserved.</p>
          </div>
        </footer>
    </div>
  );
};

export default LandingPage;