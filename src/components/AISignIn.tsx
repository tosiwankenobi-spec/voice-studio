import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function AISignIn() {
  return (
    <Button asChild variant="outline" className="my-4">
      <Link to="/auth">Sign in to start creating</Link>
    </Button>
  );
}
