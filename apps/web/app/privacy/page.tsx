import { LegalPage, Section } from "@/components/layout/LegalPage";
import { AppLink } from "@/components/ui/AppLink";

export const metadata = { title: "Privacy", description: "What Influencer Intelligence stores, why, and who else sees it." };

export default function Privacy() {
  return (
    <LegalPage title="Privacy" updated="October 12, 2026" intro="We keep as little as the site needs to work, and nothing we can sell — we don't run ads or trackers.">
      <Section title="When you log in with X">
        <p>
          X shares your public profile with us: account id, handle, display name and profile picture. We never ask for your email and can't post for you. The access token X gives us is used once, to read that profile, and is not stored.
        </p>
      </Section>
      <Section title="Your chats">
        <p>
          Questions you ask and the answers are stored so you can reopen your chats and so usage can be measured. Free accounts see the last 7 days in their history; Plus sees everything. Answers you share get a public page at a random link — only the question and answer on it, not your account.
        </p>
      </Section>
      <Section title="Usage and abuse limits">
        <p>
          To enforce limits for visitors who aren&apos;t logged in, we store a salted hash of the IP address — never the address itself. We also record the real model cost of each answer, which is how session usage is measured.
        </p>
      </Section>
      <Section title="Payments">
        <p>
          Plus and Add are paid in USDC on Solana, straight from your wallet. We store the payment&apos;s reference key and transaction signature. Solana is public: anyone can see the transfer and the paying wallet address on-chain. We never see or store your wallet&apos;s keys.
        </p>
      </Section>
      <Section title="Cookies">
        <p>One signed session cookie keeps you logged in (30 days), and a short-lived one protects the X login step. No analytics or advertising cookies.</p>
      </Section>
      <Section title="Who else processes data">
        <ul className="list-disc space-y-1.5 pl-5 marker:text-muted">
          <li>DeepSeek — writes the answers; your question and the brain&apos;s prompt are sent to it.</li>
          <li>Netlify — hosts the site. Supabase — hosts the database.</li>
          <li>twitterapi.io — reads public posts to build and refresh brains.</li>
          <li>DefiLlama and DexScreener — live prices (no personal data is sent).</li>
          <li>Solana RPC providers — check payments on-chain.</li>
        </ul>
      </Section>
      <Section title="The people the brains are built from">
        <p>
          Brains are built only from public posts. Anyone can see exactly what each brain contains — the files are open on GitHub. If you are one of the people modelled here and want your brain removed, use the <AppLink href="/takedown" className="text-ceramic underline decoration-line-hover underline-offset-4">removal form</AppLink>; every request is read by a person.
        </p>
      </Section>
      <Section title="Deleting your data">
        <p>
          To delete your account and chats, send a request through the <AppLink href="/takedown" className="text-ceramic underline decoration-line-hover underline-offset-4">same form</AppLink> (choose &ldquo;Delete my account data&rdquo;) from the X account you log in with. Payment records that live on Solana can&apos;t be erased by anyone.
        </p>
      </Section>
    </LegalPage>
  );
}
