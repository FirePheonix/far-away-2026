import { useState, useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar";
import Preloader from "./components/Preloader";
import Home from "./pages/Home";
import About from "./pages/About";
import CaseStudies from "./pages/CaseStudies";
import CaseStudyDetail from "./pages/CaseStudyDetail";
import News from "./pages/News";
import NewsDetail from "./pages/NewsDetail";
import BookCall from "./pages/BookCall";
import PrivacyPolicy from "./pages/legal/PrivacyPolicy";
import TermsOfService from "./pages/legal/TermsOfService";
import CookiePolicy from "./pages/legal/CookiePolicy";
import Accessibility from "./pages/legal/Accessibility";
import Footer from "./components/Footer";

function App() {
  const [loading, setLoading] = useState(true);
  const { pathname } = useLocation();

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <>
      {loading && <Preloader onComplete={() => setLoading(false)} />}

      {!loading && (
        <div className="min-h-screen bg-brand-bg text-brand-dark font-sans selection:bg-brand-dark selection:text-white overflow-x-hidden flex flex-col">
          <Navbar />

          <main className="flex-grow w-full">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/about" element={<About />} />
              <Route path="/case-studies" element={<CaseStudies />} />
              <Route path="/case-studies/:id" element={<CaseStudyDetail />} />
              <Route path="/news" element={<News />} />
              <Route path="/news/:id" element={<NewsDetail />} />
              <Route path="/book-call" element={<BookCall />} />

              {/* Legal Pages */}
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/cookies" element={<CookiePolicy />} />
              <Route path="/accessibility" element={<Accessibility />} />
            </Routes>
          </main>

          <Footer />
        </div>
      )}
    </>
  );
}

export default App;
