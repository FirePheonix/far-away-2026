import React, { useEffect } from 'react';
import LegalLayout from '../../components/LegalLayout';

const PrivacyPolicy = () => {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <LegalLayout title="Privacy Policy" date="March 1, 2025">
      <p>
        At Jane AI, we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website or use our services.
      </p>
      <h3>1. Information We Collect</h3>
      <p>
        We collect information that you provide directly to us, such as when you fill out a contact form, book a call, or communicate with us via email. This may include your name, email address, company name, and phone number.
      </p>
      <h3>2. How We Use Your Information</h3>
      <p>
        We use the information we collect to provide, maintain, and improve our services, to communicate with you, and to comply with legal obligations. We do not sell your personal data to third parties.
      </p>
      <h3>3. Data Security</h3>
      <p>
        We implement appropriate technical and organizational measures to protect your personal data against unauthorized access, alteration, disclosure, or destruction.
      </p>
      <h3>4. Contact Us</h3>
      <p>
        If you have any questions about this Privacy Policy, please contact us at privacy@janeai.in.
      </p>
    </LegalLayout>
  );
};

export default PrivacyPolicy;
