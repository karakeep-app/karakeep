export default function PrivacyPolicy() {
  return (
    <div className="mx-auto max-w-3xl p-4">
      <main className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">
          Karakeep – Privacy Policy
        </h1>
        <p className="text-base leading-relaxed text-gray-700">
          This Privacy Policy applies to the Karakeep app (the “Application”)
          for mobile devices, an open-source, self-hosted service provided by
          Localhost Labs Ltd (“We”, “Us”, “Our”). Localhost Labs Ltd is
          incorporated in England & Wales (Company No. 16403882).
        </p>

        <h2 className="text-lg font-semibold text-gray-900">
          Our Core Privacy Principle: No Data Collection by Us
        </h2>
        <p className="text-base leading-relaxed text-gray-700">
          The Application is designed so that{" "}
          <strong className="font-semibold">
            no personal data or usage information is collected, transmitted, or
            stored by Us
          </strong>{" "}
          or any third party on Our behalf. All your data remains on your device
          or in your self-hosted instance.
        </p>

        <h2 className="text-lg font-semibold text-gray-900">
          Third-Party Services (Development & Distribution)
        </h2>
        <p className="text-base leading-relaxed text-gray-700">
          We build or distribute the Application via third-party platforms, each
          with its own privacy rules. We do not control these services, so
          please review their policies separately:
        </p>
        <ul className="ml-6 list-disc space-y-2 text-gray-700">
          <li>
            <strong>Expo</strong>
          </li>
          <li>
            <strong>Google Play Store</strong>
          </li>
          <li>
            <strong>Apple App Store</strong>
          </li>
          <li>
            <strong>Chrome Web Store</strong>
          </li>
          <li>
            <strong>Mozilla Add-ons</strong>
          </li>
        </ul>

        <h2 className="text-lg font-semibold text-gray-900">
          User Rights (GDPR & CCPA)
        </h2>
        <p className="text-base leading-relaxed text-gray-700">
          Although We do not collect or process personal data, you have certain
          rights under global privacy laws. If you believe We hold any data
          about you and wish to exercise these rights, please contact Us (see
          below).
        </p>
        <ul className="ml-6 list-disc space-y-2 text-gray-700">
          <li>
            <strong>GDPR (EU)</strong> – Right of access, correction, erasure,
            restriction, data portability, objection.
          </li>
          <li>
            <strong>CCPA (California)</strong> – Request disclosure of data
            categories, request deletion, opt-out of sale (we do not sell data),
            and non-discrimination for exercising rights.
          </li>
        </ul>
        <p className="text-base leading-relaxed text-gray-700">
          To exercise any rights, or if you have a complaint, email
          <a
            href="mailto:info@localhostlabs.co.uk"
            className="ml-1 text-blue-600 hover:underline"
          >
            info@localhostlabs.co.uk
          </a>
          .
        </p>

        <h2 className="text-lg font-semibold text-gray-900">
          Managing Your Information & Continued Use
        </h2>
        <p className="text-base leading-relaxed text-gray-700">
          Because We never collect your data, there is nothing to opt out of. To
          stop using the Application, simply uninstall it. All data you create
          lives on your device or self-hosted server, under your control.
        </p>

        <h2 className="text-lg font-semibold text-gray-900">Security</h2>
        <p className="text-base leading-relaxed text-gray-700">
          You are responsible for securing your device or self-hosted instance.
          We recommend using HTTPS, strong passwords, and regular backups. The
          code is open-source for community review, but We cannot guarantee
          absolute security. Use at your own risk.
        </p>

        <h2 className="text-lg font-semibold text-gray-900">
          Changes to This Privacy Policy
        </h2>
        <p className="text-base leading-relaxed text-gray-700">
          We may update this Policy from time to time. We will post changes here
          with a new effective date. Continued use of Karakeep signifies your
          acceptance of any updates.
        </p>
        <p className="text-base italic text-gray-700">
          <em>Effective date: 2025-05-24</em>
        </p>

        <h2 className="text-lg font-semibold text-gray-900">
          Your Acknowledgement
        </h2>
        <p className="text-base leading-relaxed text-gray-700">
          By using the Application, you acknowledge that you have read and agree
          to this Privacy Policy.
        </p>

        <h2 className="text-lg font-semibold text-gray-900">Contact Us</h2>
        <p className="text-base leading-relaxed text-gray-700">
          For privacy queries or to exercise your rights, contact us at:
          <br />
          Localhost Labs Ltd (England & Wales, Company No. 16403882)
          <br />
          Email:{" "}
          <a
            href="mailto:info@localhostlabs.co.uk"
            className="text-blue-600 hover:underline"
          >
            info@localhostlabs.co.uk
          </a>
        </p>
      </main>
    </div>
  );
}
