 import React from "react";
 import { Icons } from "@/lib/icons";
 
 interface BookmarkButtonProps {
   isBookmarked: boolean;
   onClick: (e: React.MouseEvent) => void;
   size?: "sm" | "md";
 }
 
 export const BookmarkButton: React.FC<BookmarkButtonProps> = ({
   isBookmarked,
   onClick,
   size = "md",
 }) => {
   const sizeClasses = size === "sm" ? "w-4 h-4" : "w-5 h-5";
   
   return (
     <button
       onClick={onClick}
       className={`transition-colors ${
         isBookmarked
           ? "text-amber-400 hover:text-amber-300"
           : "text-stone-500 hover:text-amber-400"
       }`}
       title={isBookmarked ? "Remove bookmark" : "Add bookmark"}
     >
      <Icons.Bookmark className={sizeClasses} fill={isBookmarked ? "currentColor" : "none"} />
     </button>
   );
 };
 
 export default BookmarkButton;