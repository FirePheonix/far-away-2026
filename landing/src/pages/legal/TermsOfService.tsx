import React, { useEffect } from 'react';
import LegalLayout from '../../components/LegalLayout';

const TermsOfService = () => {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <LegalLayout title="Terms of Service" date="March 1, 2025">
      <p>
        Please read these Terms of Service carefully before using the Jane AI website and services.
      </p>
      <h3>1. Acceptance of Terms</h3>
      <p>
        By accessing or using our services, you agree to be bound by these Terms. If you disagree with any part of the terms, you may not access the service.
      </p>
      <h3>2. Intellectual Property</h3>
      <p>
        The service and its original content, features, and functionality are and will remain the exclusive property of Jane AI and its licensors.
      </p>
      <h3>3. Limitation of Liability</h3>
      <p>
        In no event shall Jane AI, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential or punitive damages.
      </p>
    </LegalLayout>
  );
};

export default TermsOfService;
