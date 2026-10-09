import React from "react";
import { useParams } from "react-router-dom";
import { Dossier } from "@/components/profile/Dossier";

// Public personnel file. What appears depends on the owner's privacy settings
// and whether the visitor is signed in (enforced by cf_dossier).
export const PublicProfilePage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  if (!userId) return null;
  return (
    <div className="min-h-screen py-8 sm:py-12 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">
        <Dossier userId={userId} />
      </div>
    </div>
  );
};

export default PublicProfilePage;
