import React, { useEffect } from 'react';
import LegalLayout from '../../components/LegalLayout';

const CookiePolicy = () => {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <LegalLayout title="Cookie Policy" date="March 1, 2025">
      <p>
        This Cookie Policy explains what cookies are, how we use them, and your choices regarding cookies.
      </p>
      <h3>1. What Are Cookies</h3>
      <p>
        Cookies are small pieces of text sent by your web browser by a website you visit. A cookie file is stored in your web browser and allows the Service or a third-party to recognize you and make your next visit easier and the Service more useful to you.
      </p>
      <h3>2. How We Use Cookies</h3>
      <p>
        We use cookies for the following purposes: to enable certain functions of the Service, to provide analytics, to store your preferences, and to enable advertisements delivery, including behavioral advertising.
      </p>
    </LegalLayout>
  );
};

export default CookiePolicy;
