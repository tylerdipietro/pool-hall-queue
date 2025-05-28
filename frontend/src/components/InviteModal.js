import React from 'react';
import { Clock, Check, X } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

interface InviteModalProps {
  invite: {
    tableNumber: number;
    opponent: string;
  };
  timeLeft: number;
  onAccept: () => void;
  onSkip: () => void;
}

const InviteModal = ({ invite, timeLeft, onAccept, onSkip }: InviteModalProps) => {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md bg-white shadow-2xl border-0 animate-scale-in">
        <CardHeader className="text-center bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-t-lg">
          <CardTitle className="flex items-center justify-center gap-2">
            <Clock className="w-5 h-5" />
            Table Invitation
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 text-center">
          <div className="mb-6">
            <h3 className="text-xl font-semibold text-slate-800 mb-2">
              You've been invited to Table {invite.tableNumber}
            </h3>
            <p className="text-slate-600">
              vs <strong className="text-blue-600">{invite.opponent}</strong>
            </p>
          </div>
          
          <div className="mb-6">
            <div className="text-3xl font-bold text-red-500 mb-2">{timeLeft}</div>
            <p className="text-sm text-slate-500">seconds remaining</p>
            <div className="w-full bg-slate-200 rounded-full h-2 mt-2">
              <div 
                className="bg-gradient-to-r from-red-500 to-orange-500 h-2 rounded-full transition-all duration-1000"
                style={{ width: `${(timeLeft / 30) * 100}%` }}
              ></div>
            </div>
          </div>
          
          <div className="flex gap-3">
            <Button 
              onClick={onAccept}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            >
              <Check className="w-4 h-4 mr-2" />
              Accept
            </Button>
            <Button 
              onClick={onSkip}
              variant="outline"
              className="flex-1 border-red-300 text-red-600 hover:bg-red-50"
            >
              <X className="w-4 h-4 mr-2" />
              Skip Turn
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default InviteModal;