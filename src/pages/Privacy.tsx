// Appendix C privacy notice — plain-language, linked from login (§8.3).
// DRAFT wording: must be reviewed by the church before launch.
import { Link } from "react-router-dom";

export default function Privacy() {
  return (
    <div className="min-h-dvh bg-bg px-4 py-10">
      <div className="max-w-xl mx-auto card p-6 sm:p-8">
        <h1 className="text-2xl font-bold mb-4">Breathe Worship Scheduler — Privacy Notice</h1>
        <div className="space-y-4 text-soft text-sm leading-relaxed">
          <p>
            Breathe New Life Church ("we", "us") uses this application to organise the Breathe
            Worship team's serving rota. We collect your name, email address, phone number, and the
            roles/availability you provide so we can schedule you fairly and keep you informed about
            services you're involved in.
          </p>
          <p>
            We do not sell or share your data with third parties beyond the service providers needed
            to run this app (Supabase for hosting/database, and our email provider for
            notifications), and we do not use your data for advertising.
          </p>
          <p>
            You can ask to see the data we hold on you, correct it, or ask us to remove your personal
            details at any time by contacting the church office. Where removing your details would
            affect historical rota records, we will anonymise rather than delete those records so the
            team's serving history stays accurate.
          </p>
          <p>
            We retain your data for as long as you are an active or recent volunteer, and review
            inactive accounts periodically.
          </p>
          <p className="text-faint">Last updated: July 2026 · Draft pending church review</p>
        </div>
        <Link to="/login" className="btn-secondary mt-6">Back to sign in</Link>
      </div>
    </div>
  );
}
