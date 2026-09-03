import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  ClipboardList, 
  FileBarChart, 
  Users, 
  Settings, 
  LogOut,
  Menu,
  Bell,
  ShieldCheck,
  TrendingUp,
  Database
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

interface LayoutProps {
  children: React.ReactNode;
  role?: "admin" | "surveyor" | "supervisor";
  userName?: string;
  userEmail?: string | null;
  onLogout?: () => void;
}

export default function Layout({ children, role = "admin", userName = "User", userEmail = null, onLogout }: LayoutProps) {
  const [location] = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const navItems = [
    {
      title: "Dashboard",
      href: "/",
      icon: LayoutDashboard,
      roles: ["admin", "supervisor", "surveyor"],
    },
    {
      title: "Surveys",
      href: "/surveys",
      icon: ClipboardList,
      roles: ["admin", "supervisor", "surveyor"],
    },
    {
      title: "Reports",
      href: "/reports",
      icon: FileBarChart,
      roles: ["admin", "supervisor"],
    },
    {
      title: "Data Validation",
      href: "/validation",
      icon: ShieldCheck,
      roles: ["admin", "supervisor"],
    },
    {
      title: "Performance",
      href: "/performance",
      icon: TrendingUp,
      roles: ["admin", "supervisor"],
    },
    {
      title: "CBMS Data",
      href: "/cbms",
      icon: Database,
      roles: ["admin", "supervisor"],
    },
    {
      title: "User Management",
      href: "/users",
      icon: Users,
      roles: ["admin"],
    },
    {
      title: "Settings",
      href: "/settings",
      icon: Settings,
      roles: ["admin", "supervisor", "surveyor"],
    },
  ];

  const filteredNav = navItems.filter((item) => item.roles.includes(role));

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="p-6 flex items-center gap-3 border-b border-sidebar-border">
        <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl shadow-md">
          C
        </div>
        <div>
          <h1 className="font-bold text-lg leading-none">FDP System</h1>
          <p className="text-xs text-muted-foreground mt-1">Provincial Gov</p>
        </div>
      </div>

      <div className="flex-1 py-6 px-4 space-y-1">
        {filteredNav.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 cursor-pointer group",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                )}
              >
                <item.icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                {item.title}
              </div>
            </Link>
          );
        })}
      </div>

      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 p-2 rounded-md hover:bg-sidebar-accent/50 transition-colors">
          <Avatar className="h-9 w-9 border border-border">
            <AvatarImage src="https://github.com/shadcn.png" />
            <AvatarFallback>{userName.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-medium truncate">{userName}</p>
            <p className="text-xs text-muted-foreground truncate">{userEmail ?? `${role}@fdp.local`}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onLogout} title="Sign out">
            <LogOut className="h-4 w-4 text-muted-foreground hover:text-destructive transition-colors" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 fixed inset-y-0 z-30">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
        <SheetContent side="left" className="p-0 w-64">
          <SidebarContent />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <main className="flex-1 lg:ml-64 flex flex-col min-h-screen transition-all duration-300 ease-in-out">
        {/* Top Header */}
        <header className="h-16 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-20 px-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setIsMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <h2 className="font-semibold text-lg hidden sm:block">
              {navItems.find((i) => i.href === location)?.title || "Dashboard"}
            </h2>
          </div>

          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <span className="absolute top-2 right-2 h-2 w-2 bg-destructive rounded-full ring-2 ring-background" />
            </Button>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-secondary/50 rounded-full border border-border">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs font-medium text-muted-foreground">System Online</span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
          {children}
        </div>
      </main>
    </div>
  );
}
