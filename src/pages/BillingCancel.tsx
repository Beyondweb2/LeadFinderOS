import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { XCircle, ArrowLeft } from 'lucide-react';
import appLogo from '@/assets/logo.png';

const BillingCancel = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div 
        className="fixed inset-0 pointer-events-none opacity-30"
        style={{ background: 'var(--gradient-glow)' }}
      />
      
      <Card className="relative z-10 w-full max-w-md bg-card/80 backdrop-blur-xl border-primary/20">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src={appLogo} alt="LeadFinder Pro" className="h-12 w-12" />
          </div>
          <CardTitle className="text-2xl font-bold">
            Lead<span className="text-gradient-primary">Finder</span> Pro
          </CardTitle>
        </CardHeader>
        
        <CardContent className="flex flex-col items-center gap-4 py-8">
          <XCircle className="h-12 w-12 text-muted-foreground" />
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Checkout Cancelled</h2>
            <p className="text-muted-foreground mb-6">
              No worries! Your card was not charged. You can start your free trial whenever you're ready.
            </p>
            <div className="flex flex-col gap-2">
              <Button onClick={() => navigate('/subscribe')}>
                Try Again
              </Button>
              <Button variant="ghost" onClick={() => navigate('/landing')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Home
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BillingCancel;
