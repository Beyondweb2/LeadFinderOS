import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import icpLogo from "@/assets/icp-logo.png";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

export function InternetIdentityButton() {
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = async () => {
    setIsLoading(true);
    try {
      const { AuthClient } = await import("@dfinity/auth-client");
      const authClient = await AuthClient.create();

      await new Promise<void>((resolve, reject) => {
        authClient.login({
          identityProvider: "https://identity.ic0.app",
          maxTimeToLive: BigInt(24 * 60 * 60 * 1_000_000_000),
          onSuccess: () => resolve(),
          onError: (e) => reject(new Error(String(e))),
        });
      });

      const principal = authClient.getIdentity().getPrincipal().toText();

      const { data, error } = await supabase.functions.invoke("ii-auth", {
        body: { principal },
      });

      if (error || !data) throw new Error(error?.message || "Login failed");

      const { error: otpError } = await supabase.auth.verifyOtp({
        email: data.email,
        token: data.token_hash,
        type: "magiclink",
      });

      if (otpError) throw new Error(otpError.message);

      toast({ title: "Logged in with Internet Identity!" });
      navigate("/");
    } catch (err) {
      toast({
        title: "Login failed",
        description: err instanceof Error ? err.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full h-11 text-sm font-semibold border-0 bg-[hsl(270,30%,16%)] hover:bg-[hsl(270,30%,20%)] text-foreground shadow-[0_0_12px_hsl(270,60%,50%,0.15)]"
      onClick={handleLogin}
      disabled={isLoading}
    >
      {isLoading ? (
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
      ) : (
        <img src={icpLogo} alt="ICP" className="mr-2 h-4 w-4" />
      )}
      {isLoading ? "Opening Internet Identity…" : "Continue with Internet Identity"}
    </Button>
  );
}
