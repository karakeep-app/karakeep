"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/trpc";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Share2,
  Sparkles,
  Calendar,
  Clock,
  Tag,
  Globe,
  Heart,
  Highlighter,
  List,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const dayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function formatHour(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

function formatSourceName(source: string | null): string {
  if (!source) return "Unknown";
  const sourceMap: Record<string, string> = {
    api: "API",
    web: "Web",
    extension: "Browser Extension",
    cli: "CLI",
    mobile: "Mobile App",
    singlefile: "SingleFile",
    rss: "RSS Feed",
    import: "Import",
  };
  return sourceMap[source] || source;
}

export default function Wrapped2025Page() {
  const router = useRouter();
  const { data, isLoading, error } = api.users.wrapped2025.useQuery();
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        prevSlide();
      } else if (e.key === "ArrowRight") {
        nextSlide();
      } else if (e.key === "Escape") {
        router.push("/dashboard");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentSlide, data]);

  const nextSlide = () => {
    if (data && currentSlide < totalSlides - 1) {
      setCurrentSlide(currentSlide + 1);
    }
  };

  const prevSlide = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "My Karakeep 2025 Wrapped",
          text: `I saved ${data?.totalBookmarks2025 || 0} bookmarks in 2025! Check out your year at Karakeep.`,
          url: window.location.origin + "/wrapped/2025",
        });
      } catch (err) {
        console.error("Error sharing:", err);
      }
    } else {
      // Fallback: copy link to clipboard
      navigator.clipboard.writeText(window.location.href);
      alert("Link copied to clipboard!");
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-purple-600 via-pink-600 to-blue-600 flex items-center justify-center">
        <Card className="p-8">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-4 w-48" />
        </Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-purple-600 via-pink-600 to-blue-600 flex items-center justify-center">
        <Card className="p-8">
          <h1 className="text-2xl font-bold mb-4">Error Loading Wrapped</h1>
          <p className="text-muted-foreground mb-4">
            {error?.message || "Failed to load your 2025 wrapped data"}
          </p>
          <Button onClick={() => router.push("/dashboard")}>
            Back to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  if (data.totalBookmarks2025 === 0) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-purple-600 via-pink-600 to-blue-600 flex items-center justify-center">
        <Card className="p-8 text-center max-w-md">
          <Sparkles className="w-16 h-16 mx-auto mb-4 text-purple-600" />
          <h1 className="text-2xl font-bold mb-4">No Activity in 2025 Yet</h1>
          <p className="text-muted-foreground mb-4">
            Start bookmarking to see your 2025 wrapped next time!
          </p>
          <Button onClick={() => router.push("/dashboard")}>
            Back to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  const totalSlides = 10;

  const slides = [
    // Slide 0: Welcome
    <div key="welcome" className="flex flex-col items-center justify-center h-full text-white">
      <Sparkles className="w-24 h-24 mb-8 animate-pulse" />
      <h1 className="text-6xl font-bold mb-4 text-center">Your 2025</h1>
      <h2 className="text-4xl font-bold mb-8 text-center">Wrapped</h2>
      <p className="text-xl text-center opacity-90">
        A year of knowledge, saved and cherished
      </p>
    </div>,

    // Slide 1: Total bookmarks
    <div key="total" className="flex flex-col items-center justify-center h-full text-white">
      <div className="text-center">
        <p className="text-2xl mb-4 opacity-90">In 2025, you saved</p>
        <div className="text-9xl font-bold mb-4 animate-pulse">
          {data.totalBookmarks2025.toLocaleString()}
        </div>
        <p className="text-3xl opacity-90">
          {data.totalBookmarks2025 === 1 ? "bookmark" : "bookmarks"}
        </p>
        <Zap className="w-16 h-16 mx-auto mt-8 opacity-75" />
      </div>
    </div>,

    // Slide 2: First bookmark
    <div key="first" className="flex flex-col items-center justify-center h-full text-white px-8">
      <Calendar className="w-16 h-16 mb-8 opacity-75" />
      <p className="text-2xl mb-4 text-center opacity-90">
        Your first bookmark of 2025
      </p>
      {data.firstBookmark2025 ? (
        <>
          <div className="text-4xl font-bold mb-4 text-center max-w-2xl">
            {data.firstBookmark2025.title || "Untitled"}
          </div>
          <p className="text-xl opacity-75">
            {new Date(data.firstBookmark2025.createdAt).toLocaleDateString(
              "en-US",
              {
                month: "long",
                day: "numeric",
                year: "numeric",
              }
            )}
          </p>
        </>
      ) : (
        <p className="text-xl opacity-75">No data available</p>
      )}
    </div>,

    // Slide 3: Most active month
    <div key="month" className="flex flex-col items-center justify-center h-full text-white">
      <TrendingUp className="w-16 h-16 mb-8 opacity-75" />
      <p className="text-2xl mb-4 opacity-90">Your most active month</p>
      {data.mostActiveMonth ? (
        <>
          <div className="text-7xl font-bold mb-4">
            {monthNames[data.mostActiveMonth.month - 1]}
          </div>
          <p className="text-2xl opacity-75">
            {data.mostActiveMonth.count} bookmarks saved
          </p>
        </>
      ) : (
        <p className="text-xl opacity-75">No data available</p>
      )}
    </div>,

    // Slide 4: Most active day of week
    <div key="day" className="flex flex-col items-center justify-center h-full text-white">
      <Calendar className="w-16 h-16 mb-8 opacity-75" />
      <p className="text-2xl mb-4 opacity-90">You bookmarked most on</p>
      {data.mostActiveDay ? (
        <>
          <div className="text-7xl font-bold mb-4">
            {dayNames[data.mostActiveDay.day]}s
          </div>
          <p className="text-2xl opacity-75">
            {data.mostActiveDay.count} bookmarks
          </p>
        </>
      ) : (
        <p className="text-xl opacity-75">No data available</p>
      )}
    </div>,

    // Slide 5: Most active hour
    <div key="hour" className="flex flex-col items-center justify-center h-full text-white">
      <Clock className="w-16 h-16 mb-8 opacity-75" />
      <p className="text-2xl mb-4 opacity-90">Your peak bookmarking time</p>
      {data.mostActiveHour ? (
        <>
          <div className="text-7xl font-bold mb-4">
            {formatHour(data.mostActiveHour.hour)}
          </div>
          <p className="text-2xl opacity-75">
            {data.mostActiveHour.count} bookmarks at this hour
          </p>
        </>
      ) : (
        <p className="text-xl opacity-75">No data available</p>
      )}
    </div>,

    // Slide 6: Top domains
    <div key="domains" className="flex flex-col items-center justify-center h-full text-white px-8">
      <Globe className="w-16 h-16 mb-8 opacity-75" />
      <p className="text-3xl mb-8 font-bold">Your Top Domains</p>
      {data.topDomains2025.length > 0 ? (
        <div className="space-y-4 w-full max-w-2xl">
          {data.topDomains2025.slice(0, 5).map((domain, index) => (
            <div
              key={domain.domain}
              className="flex items-center justify-between bg-white/10 backdrop-blur-sm rounded-lg p-4"
            >
              <div className="flex items-center gap-4">
                <span className="text-3xl font-bold opacity-50">
                  {index + 1}
                </span>
                <span className="text-xl font-medium">{domain.domain}</span>
              </div>
              <span className="text-2xl font-bold">{domain.count}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xl opacity-75">No domains found</p>
      )}
    </div>,

    // Slide 7: Top tags
    <div key="tags" className="flex flex-col items-center justify-center h-full text-white px-8">
      <Tag className="w-16 h-16 mb-8 opacity-75" />
      <p className="text-3xl mb-8 font-bold">Your Favorite Tags</p>
      {data.topTags2025.length > 0 ? (
        <div className="space-y-4 w-full max-w-2xl">
          {data.topTags2025.slice(0, 5).map((tag, index) => (
            <div
              key={tag.name}
              className="flex items-center justify-between bg-white/10 backdrop-blur-sm rounded-lg p-4"
            >
              <div className="flex items-center gap-4">
                <span className="text-3xl font-bold opacity-50">
                  {index + 1}
                </span>
                <span className="text-xl font-medium">#{tag.name}</span>
              </div>
              <span className="text-2xl font-bold">{tag.count}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xl opacity-75">No tags found</p>
      )}
    </div>,

    // Slide 8: Stats overview
    <div key="stats" className="flex flex-col items-center justify-center h-full text-white px-8">
      <p className="text-3xl mb-8 font-bold">More Highlights</p>
      <div className="grid grid-cols-2 gap-6 max-w-3xl">
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 text-center">
          <Heart className="w-12 h-12 mx-auto mb-4 opacity-75" />
          <div className="text-5xl font-bold mb-2">{data.favorites2025}</div>
          <p className="text-lg opacity-90">Favorites</p>
        </div>
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 text-center">
          <Highlighter className="w-12 h-12 mx-auto mb-4 opacity-75" />
          <div className="text-5xl font-bold mb-2">{data.highlights2025}</div>
          <p className="text-lg opacity-90">Highlights</p>
        </div>
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 text-center">
          <List className="w-12 h-12 mx-auto mb-4 opacity-75" />
          <div className="text-5xl font-bold mb-2">
            {data.listsCreated2025}
          </div>
          <p className="text-lg opacity-90">Lists Created</p>
        </div>
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 text-center">
          {data.mostUsedSource ? (
            <>
              <Zap className="w-12 h-12 mx-auto mb-4 opacity-75" />
              <div className="text-2xl font-bold mb-2">
                {formatSourceName(data.mostUsedSource.source)}
              </div>
              <p className="text-lg opacity-90">Most Used Source</p>
            </>
          ) : (
            <p className="text-lg opacity-75">No source data</p>
          )}
        </div>
      </div>
    </div>,

    // Slide 9: Final summary
    <div key="summary" className="flex flex-col items-center justify-center h-full text-white px-8">
      <Sparkles className="w-20 h-20 mb-8 animate-pulse" />
      <h2 className="text-5xl font-bold mb-6 text-center">
        That's Your 2025!
      </h2>
      <p className="text-2xl mb-8 text-center opacity-90 max-w-2xl">
        You saved {data.totalBookmarks2025.toLocaleString()} bookmarks,
        organized them with {data.topTags2025.length} top tags, and created{" "}
        {data.listsCreated2025} lists
      </p>
      <p className="text-xl opacity-75 text-center mb-8">
        Here's to another amazing year of collecting knowledge!
      </p>
      <div className="flex gap-4">
        <Button
          onClick={handleShare}
          size="lg"
          className="bg-white text-purple-600 hover:bg-gray-100"
        >
          <Share2 className="w-5 h-5 mr-2" />
          Share Your Wrapped
        </Button>
        <Button
          onClick={() => router.push("/dashboard")}
          size="lg"
          variant="outline"
          className="bg-white/10 backdrop-blur-sm text-white border-white/20 hover:bg-white/20"
        >
          Back to Dashboard
        </Button>
      </div>
    </div>,
  ];

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-purple-600 via-pink-600 to-blue-600 overflow-hidden">
      {/* Progress indicators */}
      <div className="absolute top-4 left-0 right-0 flex gap-1 px-4 z-10">
        {Array.from({ length: totalSlides }).map((_, index) => (
          <div
            key={index}
            className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden"
          >
            <div
              className={`h-full bg-white transition-all duration-300 ${
                index < currentSlide
                  ? "w-full"
                  : index === currentSlide
                    ? "w-full animate-pulse"
                    : "w-0"
              }`}
            />
          </div>
        ))}
      </div>

      {/* Main content */}
      <div className="h-full flex items-center justify-center p-8">
        <div className="w-full max-w-5xl h-full max-h-[80vh] relative">
          {slides[currentSlide]}
        </div>
      </div>

      {/* Navigation */}
      <div className="absolute bottom-8 left-0 right-0 flex justify-center items-center gap-8 z-10">
        <Button
          onClick={prevSlide}
          disabled={currentSlide === 0}
          size="lg"
          className="bg-white/10 backdrop-blur-sm text-white border-white/20 hover:bg-white/20 disabled:opacity-30"
          variant="outline"
        >
          <ChevronLeft className="w-6 h-6" />
        </Button>
        <div className="text-white text-lg font-medium">
          {currentSlide + 1} / {totalSlides}
        </div>
        <Button
          onClick={nextSlide}
          disabled={currentSlide === totalSlides - 1}
          size="lg"
          className="bg-white/10 backdrop-blur-sm text-white border-white/20 hover:bg-white/20 disabled:opacity-30"
          variant="outline"
        >
          <ChevronRight className="w-6 h-6" />
        </Button>
      </div>

      {/* Close button */}
      <Button
        onClick={() => router.push("/dashboard")}
        className="absolute top-4 right-4 bg-white/10 backdrop-blur-sm text-white border-white/20 hover:bg-white/20 z-10"
        variant="outline"
        size="sm"
      >
        Close
      </Button>
    </div>
  );
}
