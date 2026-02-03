import React, { useState, useRef, useEffect } from "react";
import { Icons } from "@/lib/icons";
import { Chapter, ForumPost, GlossaryEntry, User, generateId } from "@/lib/data";

interface AdminPanelProps {
  chapters: Chapter[];
  setChapters: (chapters: Chapter[]) => void;
  posts: ForumPost[];
  setPosts: (posts: ForumPost[]) => void;
  users: User[];
  glossary: Record<string, GlossaryEntry>;
  setGlossary: (glossary: Record<string, GlossaryEntry>) => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  chapters,
  setChapters,
  posts,
  setPosts,
  users,
  glossary,
  setGlossary,
}) => {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null);
  const [draftContent, setDraftContent] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [newTerm, setNewTerm] = useState({
    name: "",
    type: "character" as GlossaryEntry["type"],
    description: "",
  });
  const editorRef = useRef<HTMLDivElement>(null);

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: Icons.Dashboard },
    { id: "chapters", label: "Chapters", icon: Icons.FileText },
    { id: "glossary", label: "Glossary", icon: Icons.Book },
    { id: "forum", label: "Forum", icon: Icons.Message },
    { id: "users", label: "Users", icon: Icons.Users },
    { id: "settings", label: "Settings", icon: Icons.Settings },
  ];

  const startEditing = (chapter: Chapter) => {
    setEditingChapter(chapter);
    setDraftTitle(chapter.title);
    setDraftContent(chapter.content);
  };

  const saveChapter = () => {
    if (!editingChapter) return;
    const updated = chapters.map((c) =>
      c.id === editingChapter.id
        ? { ...c, title: draftTitle, content: draftContent }
        : c
    );
    setChapters(updated);
    setEditingChapter(null);
  };

  const createNewChapter = () => {
    const newChapter: Chapter = {
      id: generateId(),
      title: "New Chapter",
      content: "<p>Start writing your chapter here...</p>",
      chapterNumber: chapters.length + 1,
      publishedAt: new Date().toISOString().split("T")[0],
      views: 0,
      comments: [],
    };
    setChapters([...chapters, newChapter]);
    startEditing(newChapter);
  };

  const deleteChapter = (id: string) => {
    if (window.confirm("Are you sure you want to delete this chapter?")) {
      setChapters(chapters.filter((c) => c.id !== id));
    }
  };

  const deletePost = (id: string) => {
    if (window.confirm("Are you sure you want to delete this post?")) {
      setPosts(posts.filter((p) => p.id !== id));
    }
  };

  const addGlossaryTerm = () => {
    if (newTerm.name && newTerm.description) {
      setGlossary({
        ...glossary,
        [newTerm.name]: { type: newTerm.type, description: newTerm.description },
      });
      setNewTerm({ name: "", type: "character", description: "" });
    }
  };

  const deleteGlossaryTerm = (term: string) => {
    const updated = { ...glossary };
    delete updated[term];
    setGlossary(updated);
  };

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
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        {/* Dashboard */}
        {activeTab === "dashboard" && (
          <div>
            <h1 className="font-display text-3xl text-amber-100 mb-8">
              Dashboard
            </h1>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
              <div className="p-6 bg-stone-800/50 rounded-xl border border-stone-700">
                <div className="text-3xl font-display text-stone-100">
                  {chapters.length}
                </div>
                <div className="text-stone-500 mt-1">Chapters</div>
              </div>
              <div className="p-6 bg-stone-800/50 rounded-xl border border-stone-700">
                <div className="text-3xl font-display text-stone-100">
                  {chapters.reduce((sum, c) => sum + c.views, 0).toLocaleString()}
                </div>
                <div className="text-stone-500 mt-1">Total Views</div>
              </div>
              <div className="p-6 bg-stone-800/50 rounded-xl border border-stone-700">
                <div className="text-3xl font-display text-stone-100">
                  {posts.length}
                </div>
                <div className="text-stone-500 mt-1">Forum Posts</div>
              </div>
              <div className="p-6 bg-stone-800/50 rounded-xl border border-stone-700">
                <div className="text-3xl font-display text-stone-100">
                  {Object.keys(glossary).length}
                </div>
                <div className="text-stone-500 mt-1">Glossary Terms</div>
              </div>
            </div>
          </div>
        )}

        {/* Chapters */}
        {activeTab === "chapters" && (
          <div>
            <div className="flex items-center justify-between mb-8">
              <h1 className="font-display text-3xl text-amber-100">
                Manage Chapters
              </h1>
              <button
                onClick={createNewChapter}
                className="flex items-center gap-2 px-6 py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-medium transition-colors"
              >
                <Icons.Plus />
                New Chapter
              </button>
            </div>

            {editingChapter ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setEditingChapter(null)}
                    className="flex items-center gap-2 text-stone-400 hover:text-stone-200"
                  >
                    <Icons.ChevronLeft />
                    Back to chapters
                  </button>
                  <button
                    onClick={saveChapter}
                    className="flex items-center gap-2 px-6 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-medium transition-colors"
                  >
                    <Icons.Save />
                    Save & Close
                  </button>
                </div>

                <div>
                  <label className="block text-stone-300 text-sm mb-2">
                    Chapter Title
                  </label>
                  <input
                    type="text"
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    className="w-full px-4 py-3 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 text-xl font-display focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-stone-300 text-sm mb-2">
                    Content (HTML)
                  </label>
                  <textarea
                    value={draftContent}
                    onChange={(e) => setDraftContent(e.target.value)}
                    className="w-full px-4 py-3 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 focus:outline-none focus:border-sky-500 font-mono text-sm"
                    rows={20}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {chapters.map((chapter) => (
                  <div
                    key={chapter.id}
                    className="p-6 bg-stone-800/50 rounded-xl border border-stone-700 flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="px-3 py-1 bg-sky-600/20 text-sky-400 rounded-full text-sm">
                          Chapter {chapter.chapterNumber}
                        </span>
                        <span className="text-stone-500 text-sm">
                          {chapter.publishedAt}
                        </span>
                      </div>
                      <h3 className="text-xl text-stone-100">{chapter.title}</h3>
                      <div className="flex items-center gap-4 mt-2 text-stone-500 text-sm">
                        <span className="flex items-center gap-1">
                          <Icons.Eye className="w-4 h-4" /> {chapter.views}
                        </span>
                        <span className="flex items-center gap-1">
                          <Icons.Message className="w-4 h-4" />{" "}
                          {chapter.comments?.length || 0}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => startEditing(chapter)}
                        className="p-2 text-stone-400 hover:text-sky-400 hover:bg-stone-700 rounded-lg transition-colors"
                      >
                        <Icons.Edit />
                      </button>
                      <button
                        onClick={() => deleteChapter(chapter.id)}
                        className="p-2 text-stone-400 hover:text-red-400 hover:bg-stone-700 rounded-lg transition-colors"
                      >
                        <Icons.Trash />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Glossary */}
        {activeTab === "glossary" && (
          <div>
            <div className="flex items-center justify-between mb-8">
              <h1 className="font-display text-3xl text-amber-100">Glossary</h1>
              <p className="text-stone-500 text-sm">
                Define characters, locations, and concepts
              </p>
            </div>

            {/* Add new term */}
            <div className="mb-8 p-6 bg-stone-800/50 rounded-xl border border-stone-700">
              <h3 className="text-lg text-stone-200 mb-4">Add New Term</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <input
                  type="text"
                  value={newTerm.name}
                  onChange={(e) =>
                    setNewTerm({ ...newTerm, name: e.target.value })
                  }
                  className="px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 focus:outline-none focus:border-sky-500"
                  placeholder="Term name"
                />
                <select
                  value={newTerm.type}
                  onChange={(e) =>
                    setNewTerm({
                      ...newTerm,
                      type: e.target.value as GlossaryEntry["type"],
                    })
                  }
                  className="px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 focus:outline-none focus:border-sky-500"
                >
                  <option value="character">Character</option>
                  <option value="location">Location</option>
                  <option value="creature">Creature</option>
                  <option value="concept">Concept</option>
                </select>
                <button
                  onClick={addGlossaryTerm}
                  className="px-6 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors"
                >
                  Add Term
                </button>
              </div>
              <textarea
                value={newTerm.description}
                onChange={(e) =>
                  setNewTerm({ ...newTerm, description: e.target.value })
                }
                className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 focus:outline-none focus:border-sky-500 resize-none"
                rows={2}
                placeholder="Description..."
              />
            </div>

            {/* Existing terms */}
            <div className="space-y-2">
              {Object.entries(glossary).map(([term, entry]) => (
                <div
                  key={term}
                  className="p-4 bg-stone-800/30 rounded-lg border border-stone-800/50 flex items-start justify-between"
                >
                  <div>
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
                  <button
                    onClick={() => deleteGlossaryTerm(term)}
                    className="text-stone-500 hover:text-red-400 transition-colors"
                  >
                    <Icons.Trash />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Forum */}
        {activeTab === "forum" && (
          <div>
            <h1 className="font-display text-3xl text-amber-100 mb-8">
              Moderate Forum
            </h1>
            <div className="space-y-4">
              {posts.map((post) => (
                <div
                  key={post.id}
                  className="p-6 bg-stone-800/50 rounded-xl border border-stone-700 flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="px-3 py-1 bg-amber-600/20 text-amber-400 rounded-full text-sm">
                        {post.category}
                      </span>
                      <span className="text-stone-500 text-sm">
                        {post.replies} replies
                      </span>
                    </div>
                    <h3 className="text-xl text-stone-100">{post.title}</h3>
                    <p className="text-stone-400 text-sm mt-1">
                      by {post.author}
                    </p>
                  </div>
                  <button
                    onClick={() => deletePost(post.id)}
                    className="p-2 text-stone-400 hover:text-red-400 hover:bg-stone-700 rounded-lg transition-colors"
                  >
                    <Icons.Trash />
                  </button>
                </div>
              ))}
              {posts.length === 0 && (
                <p className="text-stone-500 text-center py-12">
                  No forum posts yet.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Users */}
        {activeTab === "users" && (
          <div>
            <h1 className="font-display text-3xl text-amber-100 mb-8">
              Manage Users
            </h1>
            <div className="bg-stone-800/50 rounded-xl border border-stone-700 overflow-hidden">
              <table className="w-full">
                <thead className="bg-stone-800">
                  <tr>
                    <th className="text-left p-4 text-stone-400 font-medium">
                      User
                    </th>
                    <th className="text-left p-4 text-stone-400 font-medium">
                      Email
                    </th>
                    <th className="text-left p-4 text-stone-400 font-medium">
                      Role
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-t border-stone-700">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-600 to-maroon-600 flex items-center justify-center text-white font-medium">
                            {user.name?.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-stone-200">{user.name}</span>
                        </div>
                      </td>
                      <td className="p-4 text-stone-400">{user.email}</td>
                      <td className="p-4">
                        <span
                          className={`px-3 py-1 rounded-full text-sm ${
                            user.isAdmin
                              ? "bg-amber-600/20 text-amber-400"
                              : "bg-stone-700 text-stone-400"
                          }`}
                        >
                          {user.isAdmin ? "Admin" : "User"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Settings */}
        {activeTab === "settings" && (
          <div>
            <h1 className="font-display text-3xl text-amber-100 mb-8">
              Site Settings
            </h1>
            <div className="max-w-2xl space-y-6">
              <div className="p-6 bg-stone-800/50 rounded-xl border border-stone-700">
                <h3 className="text-lg text-stone-200 mb-4">General Settings</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-stone-400 text-sm mb-2">
                      Site Title
                    </label>
                    <input
                      type="text"
                      defaultValue="Sedorium"
                      className="w-full px-4 py-3 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-stone-400 text-sm mb-2">
                      Site Description
                    </label>
                    <textarea
                      defaultValue="A fantasy epic of druids, kingdoms, and ancient power."
                      className="w-full px-4 py-3 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 focus:outline-none focus:border-sky-500 resize-none"
                      rows={3}
                    />
                  </div>
                </div>
              </div>

              <button className="px-6 py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-medium transition-colors">
                Save Settings
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminPanel;
