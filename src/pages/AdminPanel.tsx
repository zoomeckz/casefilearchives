import React, { useState } from "react";
import { Icons } from "@/lib/icons";
import { GlossaryEntry } from "@/lib/data";

interface AdminPanelProps {
  glossary: Record<string, GlossaryEntry>;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  glossary,
}) => {
  const [activeTab, setActiveTab] = useState("dashboard");

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: Icons.Dashboard },
    { id: "glossary", label: "Glossary", icon: Icons.Book },
  ];

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-stone-900 border-r border-stone-800 p-6">
        <h2 className="font-display text-xl text-amber-100 mb-8">
          Admin Panel
        </h2>
        <nav className="space-y-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                activeTab === tab.id
                  ? "bg-sky-600/20 text-sky-400"
                  : "text-stone-400 hover:text-stone-200 hover:bg-stone-800"
              }`}
            >
              <tab.icon className="w-5 h-5" />
              {tab.label}
            </button>
          ))}
        </nav>
        
        <div className="mt-8 p-4 bg-stone-800/50 rounded-lg border border-stone-700">
          <p className="text-stone-400 text-sm">
            To manage chapters and other content, visit the Cloud tab to access the database directly.
          </p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        {/* Dashboard */}
        {activeTab === "dashboard" && (
          <div>
            <h1 className="font-display text-3xl text-amber-100 mb-8">
              Dashboard
            </h1>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
              <div className="p-6 bg-stone-800/50 rounded-xl border border-stone-700">
                <div className="text-3xl font-display text-stone-100">
                  {Object.keys(glossary).length}
                </div>
                <div className="text-stone-500 mt-1">Glossary Terms</div>
              </div>
              <div className="p-6 bg-stone-800/50 rounded-xl border border-stone-700">
                <div className="text-stone-400 text-sm">
                  Use Lovable Cloud to manage chapters, posts, and users directly in the database.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Glossary (read-only view) */}
        {activeTab === "glossary" && (
          <div>
            <div className="flex items-center justify-between mb-8">
              <h1 className="font-display text-3xl text-amber-100">Glossary</h1>
              <p className="text-stone-500 text-sm">
                Characters, locations, and concepts
              </p>
            </div>

            {/* Existing terms */}
            <div className="space-y-2">
              {Object.entries(glossary).map(([term, entry]) => (
                <div
                  key={term}
                  className="p-4 bg-stone-800/30 rounded-lg border border-stone-800/50"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-stone-100 font-medium">{term}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        entry.type === "character"
                          ? "bg-sky-400/10 text-sky-400"
                          : entry.type === "location"
                          ? "bg-amber-400/10 text-amber-400"
                          : entry.type === "creature"
                          ? "bg-red-400/10 text-red-400"
                          : "bg-purple-400/10 text-purple-400"
                      }`}
                    >
                      {entry.type}
                    </span>
                  </div>
                  <p className="text-stone-500 text-sm">{entry.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminPanel;
