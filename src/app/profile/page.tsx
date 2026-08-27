import ProfileForm from "@/components/ProfileForm";
import ChangePassword from "@/components/ChangePassword";
import { createClient, getUser } from "@/lib/supabase/server";
import type { Profile } from "@/lib/profile";

export default async function ProfilePage() {
  const supabase = await createClient();
  const user = await getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, height_in, age, weight_lb, sex")
    .eq("id", user!.id)
    .maybeSingle();

  return (
    <>
      <ProfileForm initial={(profile as Profile) ?? null} />
      {profile ? <ChangePassword /> : null}
    </>
  );
}
