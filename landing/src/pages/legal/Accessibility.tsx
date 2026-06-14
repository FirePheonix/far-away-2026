import React, { useEffect } from 'react';
import LegalLayout from '../../components/LegalLayout';

const Accessibility = () => {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <LegalLayout title="Accessibility Statement" date="March 1, 2025">
      <p>
        Jane AI is committed to ensuring digital accessibility for people with disabilities. We are continually improving the user experience for everyone and applying the relevant accessibility standards.
      </p>
      <h3>1. Conformance Status</h3>
      <p>
        The Web Content Accessibility Guidelines (WCAG) defines requirements for designers and developers to improve accessibility for people with disabilities. It defines three levels of conformance: Level A, Level AA, and Level AAA. Jane AI is partially conformant with WCAG 2.1 level AA.
      </p>
      <h3>2. Feedback</h3>
      <p>
        We welcome your feedback on the accessibility of Jane AI. Please let us know if you encounter accessibility barriers on our website.
      </p>
    </LegalLayout>
  );
};

export default Accessibility;
