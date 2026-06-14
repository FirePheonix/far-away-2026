import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import assets from '../data/assets.json';

const Footer = () => {
  const currentYear = new Date().getFullYear();
  const location = useLocation();
  const navigate = useNavigate();

  const handleFAQClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (location.pathname !== '/') {
      navigate('/#faq');
    } else {
      const faqSection = document.getElementById('faq');
      if (faqSection) {
        faqSection.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  return (
    <footer className="w-full bg-[#F9F8F6] pt-24 pb-12 border-t border-brand-dark/5">
      <div className="max-w-[1400px] mx-auto px-4 md:px-8">
        
        {/* Top Section with Logo and Flower */}
        <div className="flex flex-col items-center mb-20 text-center">
          <h2 className="text-4xl md:text-5xl font-serif text-brand-dark mb-4">Jane</h2>
          <p className="text-brand-text/60 text-sm mb-12">Helping you automate what matters.</p>
          
          <div className="flex items-center gap-6 mb-12">
             {/* Social Icons - Visual Only */}
             <div className="flex gap-4 opacity-40 select-none pointer-events-none">
                <div className="w-5 h-5 border border-brand-dark rounded-full flex items-center justify-center text-[10px]">X</div>
                <div className="w-5 h-5 border border-brand-dark rounded-full flex items-center justify-center text-[10px]">In</div>
                <div className="w-5 h-5 border border-brand-dark rounded-full flex items-center justify-center text-[10px]">M</div>
             </div>
          </div>

          {/* Flower Image */}
          <div className="w-48 h-48 md:w-64 md:h-64 relative">
             <img 
               src={assets.vercel.visuals.decorative_flower} 
               alt="Jane Flower" 
               className="w-full h-full object-cover rounded-full mix-blend-multiply opacity-80"
             />
          </div>
        </div>

        {/* Links Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 border-t border-brand-dark/5 pt-16 mb-16">
          <div className="flex flex-col gap-4">
            <h4 className="text-xs font-medium uppercase tracking-wide text-brand-dark mb-2">Navigate</h4>
            <Link to="/" className="text-sm text-brand-text/70 hover:text-brand-dark transition-colors">Home</Link>
            <Link to="/about" className="text-sm text-brand-text/70 hover:text-brand-dark transition-colors">About</Link>
            <Link to="/case-studies" className="text-sm text-brand-text/70 hover:text-brand-dark transition-colors">Case Studies</Link>
            <Link to="/news" className="text-sm text-brand-text/70 hover:text-brand-dark transition-colors">News</Link>
          </div>

          <div className="flex flex-col gap-4">
            <h4 className="text-xs font-medium uppercase tracking-wide text-brand-dark mb-2">Resources</h4>
            <Link to="/case-studies" className="text-sm text-brand-text/70 hover:text-brand-dark transition-colors">Case Studies</Link>
            <Link to="/about" className="text-sm text-brand-text/70 hover:text-brand-dark transition-colors">How We Work</Link>
            <a href="#faq" onClick={handleFAQClick} className="text-sm text-brand-text/70 hover:text-brand-dark transition-colors">FAQ</a>
            <Link to="/news" className="text-sm text-brand-text/70 hover:text-brand-dark transition-colors">News</Link>
          </div>

          <div className="flex flex-col gap-4">
            <h4 className="text-xs font-medium uppercase tracking-wide text-brand-dark mb-2">Connect</h4>
            <Link to="/book-call" className="text-sm text-brand-text/70 hover:text-brand-dark transition-colors">Book a Call</Link>
            <span className="text-sm text-brand-text/40 cursor-default">Twitter</span>
            <span className="text-sm text-brand-text/40 cursor-default">Instagram</span>
            <span className="text-sm text-brand-text/40 cursor-default">Meta</span>
          </div>

          <div className="flex flex-col gap-4">
            <h4 className="text-xs font-medium uppercase tracking-wide text-brand-dark mb-2">Legal</h4>
            <Link to="/privacy" className="text-sm text-brand-text/70 hover:text-brand-dark transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="text-sm text-brand-text/70 hover:text-brand-dark transition-colors">Terms of Service</Link>
            <Link to="/cookies" className="text-sm text-brand-text/70 hover:text-brand-dark transition-colors">Cookie Policy</Link>
            <Link to="/accessibility" className="text-sm text-brand-text/70 hover:text-brand-dark transition-colors">Accessibility</Link>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] text-brand-text/40 uppercase tracking-wide">
          <span>© {currentYear} Jane AI. All rights reserved.</span>
          <span>Created by Dualite</span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
