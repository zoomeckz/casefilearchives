export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          category: string
          created_at: string
          description: string
          frame_style: string | null
          icon: string
          id: string
          key: string
          requirement_count: number
          requirement_type: string
          sort_order: number
          title: string
        }
        Insert: {
          category?: string
          created_at?: string
          description: string
          frame_style?: string | null
          icon?: string
          id?: string
          key: string
          requirement_count?: number
          requirement_type: string
          sort_order?: number
          title: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          frame_style?: string | null
          icon?: string
          id?: string
          key?: string
          requirement_count?: number
          requirement_type?: string
          sort_order?: number
          title?: string
        }
        Relationships: []
      }
      bookmarks: {
        Row: {
          chapter_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          chapter_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          chapter_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmarks_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      chapter_drafts: {
        Row: {
          chapter_number: number
          content: string
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          chapter_number?: number
          content?: string
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          chapter_number?: number
          content?: string
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chapter_edit_audit: {
        Row: {
          action: string
          actor_id: string | null
          anchor_found: boolean
          anchor_text: string | null
          chapter_id: string
          chapter_number: number | null
          created_at: string
          id: string
          migration_id: string | null
          new_content: string | null
          note: string | null
          previous_content: string | null
          replacement_text: string | null
        }
        Insert: {
          action?: string
          actor_id?: string | null
          anchor_found?: boolean
          anchor_text?: string | null
          chapter_id: string
          chapter_number?: number | null
          created_at?: string
          id?: string
          migration_id?: string | null
          new_content?: string | null
          note?: string | null
          previous_content?: string | null
          replacement_text?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          anchor_found?: boolean
          anchor_text?: string | null
          chapter_id?: string
          chapter_number?: number | null
          created_at?: string
          id?: string
          migration_id?: string | null
          new_content?: string | null
          note?: string | null
          previous_content?: string | null
          replacement_text?: string | null
        }
        Relationships: []
      }
      chapter_polls: {
        Row: {
          chapter_id: string
          created_at: string
          id: string
          question: string
        }
        Insert: {
          chapter_id: string
          created_at?: string
          id?: string
          question: string
        }
        Update: {
          chapter_id?: string
          created_at?: string
          id?: string
          question?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapter_polls_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      chapter_reactions: {
        Row: {
          chapter_id: string
          created_at: string
          id: string
          reaction: string
          user_id: string
        }
        Insert: {
          chapter_id: string
          created_at?: string
          id?: string
          reaction: string
          user_id: string
        }
        Update: {
          chapter_id?: string
          created_at?: string
          id?: string
          reaction?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapter_reactions_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      chapter_translations: {
        Row: {
          chapter_id: string
          content: string
          created_at: string | null
          id: string
          language_code: string
          title: string
          updated_at: string | null
        }
        Insert: {
          chapter_id: string
          content: string
          created_at?: string | null
          id?: string
          language_code: string
          title: string
          updated_at?: string | null
        }
        Update: {
          chapter_id?: string
          content?: string
          created_at?: string | null
          id?: string
          language_code?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chapter_translations_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      chapters: {
        Row: {
          chapter_number: number
          content: string
          created_at: string
          id: string
          published_at: string
          scheduled_at: string | null
          title: string
          updated_at: string
          views: number
        }
        Insert: {
          chapter_number: number
          content: string
          created_at?: string
          id?: string
          published_at?: string
          scheduled_at?: string | null
          title: string
          updated_at?: string
          views?: number
        }
        Update: {
          chapter_number?: number
          content?: string
          created_at?: string
          id?: string
          published_at?: string
          scheduled_at?: string | null
          title?: string
          updated_at?: string
          views?: number
        }
        Relationships: []
      }
      comments: {
        Row: {
          chapter_id: string
          content: string
          created_at: string
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          chapter_id: string
          content: string
          created_at?: string
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          chapter_id?: string
          content?: string
          created_at?: string
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      email_subscriptions: {
        Row: {
          created_at: string
          email: string
          id: string
          new_chapters: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          new_chapters?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          new_chapters?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      fan_art: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      fan_art_votes: {
        Row: {
          created_at: string
          fan_art_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fan_art_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          fan_art_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fan_art_votes_fan_art_id_fkey"
            columns: ["fan_art_id"]
            isOneToOne: false
            referencedRelation: "fan_art"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_posts: {
        Row: {
          category: string
          content: string
          created_at: string
          id: string
          is_pinned: boolean | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          id?: string
          is_pinned?: boolean | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          is_pinned?: boolean | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      forum_replies: {
        Row: {
          content: string
          created_at: string
          id: string
          post_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          post_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          post_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forum_replies_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "forum_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      glossary: {
        Row: {
          created_at: string
          description: string
          id: string
          image_url: string | null
          parent_term: string | null
          term: string
          type: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          image_url?: string | null
          parent_term?: string | null
          term: string
          type: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          image_url?: string | null
          parent_term?: string | null
          term?: string
          type?: string
        }
        Relationships: []
      }
      manga_panels: {
        Row: {
          caption: string | null
          chapter_id: string
          created_at: string
          id: string
          image_url: string | null
          panel_number: number
          prompt: string
          title: string
          updated_at: string
        }
        Insert: {
          caption?: string | null
          chapter_id: string
          created_at?: string
          id?: string
          image_url?: string | null
          panel_number: number
          prompt: string
          title: string
          updated_at?: string
        }
        Update: {
          caption?: string | null
          chapter_id?: string
          created_at?: string
          id?: string
          image_url?: string | null
          panel_number?: number
          prompt?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manga_panels_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          message: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      page_views: {
        Row: {
          chapter_id: string | null
          country: string | null
          created_at: string
          duration_seconds: number | null
          id: string
          page: string
          user_id: string | null
        }
        Insert: {
          chapter_id?: string | null
          country?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          page?: string
          user_id?: string | null
        }
        Update: {
          chapter_id?: string | null
          country?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          page?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "page_views_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_options: {
        Row: {
          id: string
          option_text: string
          poll_id: string
          sort_order: number
        }
        Insert: {
          id?: string
          option_text: string
          poll_id: string
          sort_order?: number
        }
        Update: {
          id?: string
          option_text?: string
          poll_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "poll_options_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "chapter_polls"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_votes: {
        Row: {
          created_at: string
          id: string
          option_id: string
          poll_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          option_id: string
          poll_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          option_id?: string
          poll_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_votes_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "poll_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "chapter_polls"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          id: string
          instagram: string | null
          name: string
          selected_frame: string | null
          tiktok: string | null
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          id?: string
          instagram?: string | null
          name: string
          selected_frame?: string | null
          tiktok?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          id?: string
          instagram?: string | null
          name?: string
          selected_frame?: string | null
          tiktok?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      reading_progress: {
        Row: {
          chapter_id: string
          id: string
          read_at: string
          user_id: string
        }
        Insert: {
          chapter_id: string
          id?: string
          read_at?: string
          user_id: string
        }
        Update: {
          chapter_id?: string
          id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reading_progress_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          code: string
          created_at: string
          id: string
          referred_id: string | null
          referrer_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          referred_id?: string | null
          referrer_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          referred_id?: string | null
          referrer_id?: string
        }
        Relationships: []
      }
      saved_quotes: {
        Row: {
          chapter_id: string
          created_at: string
          id: string
          quote_text: string
          user_id: string
        }
        Insert: {
          chapter_id: string
          created_at?: string
          id?: string
          quote_text: string
          user_id: string
        }
        Update: {
          chapter_id?: string
          created_at?: string
          id?: string
          quote_text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_quotes_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      text_highlights: {
        Row: {
          chapter_id: string
          created_at: string
          highlighted_text: string
          id: string
          note: string | null
          user_id: string
        }
        Insert: {
          chapter_id: string
          created_at?: string
          highlighted_text: string
          id?: string
          note?: string | null
          user_id: string
        }
        Update: {
          chapter_id?: string
          created_at?: string
          highlighted_text?: string
          id?: string
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "text_highlights_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      theories: {
        Row: {
          chapter_id: string | null
          content: string
          created_at: string
          id: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          chapter_id?: string | null
          content: string
          created_at?: string
          id?: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          chapter_id?: string | null
          content?: string
          created_at?: string
          id?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "theories_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      theory_votes: {
        Row: {
          created_at: string
          id: string
          theory_id: string
          user_id: string
          vote: number
        }
        Insert: {
          created_at?: string
          id?: string
          theory_id: string
          user_id: string
          vote?: number
        }
        Update: {
          created_at?: string
          id?: string
          theory_id?: string
          user_id?: string
          vote?: number
        }
        Relationships: [
          {
            foreignKeyName: "theory_votes_theory_id_fkey"
            columns: ["theory_id"]
            isOneToOne: false
            referencedRelation: "theories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_achievements: {
        Row: {
          achievement_id: string
          id: string
          unlocked_at: string
          user_id: string
        }
        Insert: {
          achievement_id: string
          id?: string
          unlocked_at?: string
          user_id: string
        }
        Update: {
          achievement_id?: string
          id?: string
          unlocked_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_seo_cron_status: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_chapter_views: {
        Args: { chapter_id: string }
        Returns: undefined
      }
      rollback_chapter_to_audit_entry: {
        Args: { _audit_id: string }
        Returns: Json
      }
      safe_replace_chapter_content: {
        Args: {
          _anchor: string
          _chapter_id: string
          _migration_id?: string
          _note?: string
          _replacement: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
