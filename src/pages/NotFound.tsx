import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Compass, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/operator/ui";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <EmptyState
        icon={Compass}
        tone="blue"
        title="Oops! Page not found"
        className="w-full max-w-md"
        action={
          <Button asChild size="sm" className="gap-1.5 rounded-full">
            <Link to="/"><Home className="h-3.5 w-3.5" />Return to Home</Link>
          </Button>
        }
      >
        404 · this address does not match a page.
      </EmptyState>
    </div>
  );
};

export default NotFound;
