import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  BIS_MASTER_PROVINCES,
  getMunicipalitiesForProvince,
  getProvinceForMunicipality,
  BIS_MASTER_LOCATIONS,
} from "@/lib/bisLocations";

export default function Settings() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const updateLocation = trpc.auth.updateLocation.useMutation({
    onSuccess: () => {
      toast.success("Your assigned city and barangay have been saved.");
      utils.auth.me.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to save your location.");
    },
  });

  const [province, setProvince] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [barangay, setBarangay] = useState("");

  // Seed the picker from whatever the surveyor already has saved, once it loads.
  useEffect(() => {
    if (!user) return;
    const savedMunicipality = user.municipality ?? "";
    setMunicipality(savedMunicipality);
    setProvince(getProvinceForMunicipality(savedMunicipality));
    setBarangay(user.barangay ?? "");
  }, [user?.municipality, user?.barangay]);

  const municipalityOptions = getMunicipalitiesForProvince(province);
  const barangayOptions = BIS_MASTER_LOCATIONS[municipality]?.barangays ?? [];

  const handleProvinceChange = (value: string) => {
    setProvince(value);
    setMunicipality("");
    setBarangay("");
  };

  const handleMunicipalityChange = (value: string) => {
    setMunicipality(value);
    setBarangay("");
  };

  const hasChanges = municipality !== (user?.municipality ?? "") || barangay !== (user?.barangay ?? "");
  const canSave = Boolean(province && municipality && barangay) && hasChanges;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Settings</h2>
        <p className="text-muted-foreground mt-1">
          Configure application preferences and account details.
        </p>
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            Active standalone account information for this device.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="rounded-md border p-3 bg-secondary/20">
              <p className="text-xs text-muted-foreground">Name</p>
              <p className="font-medium">{user?.name ?? "Unknown user"}</p>
            </div>
            <div className="rounded-md border p-3 bg-secondary/20">
              <p className="text-xs text-muted-foreground">Role</p>
              <p className="font-medium capitalize">{user?.role ?? "user"}</p>
            </div>
            <div className="rounded-md border p-3 bg-secondary/20">
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="font-medium">{user?.email ?? "Not provided"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-sm">
        <CardHeader>
          <CardTitle>Assigned Location</CardTitle>
          <CardDescription>
            The province, city, and barangay you survey in — this auto-fills Section A
            (Identification) on every survey you submit, so you only set it once here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Province</Label>
              <Select value={province} onValueChange={handleProvinceChange}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select Province" /></SelectTrigger>
                <SelectContent>
                  {BIS_MASTER_PROVINCES.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>City / Municipality</Label>
              <Select value={municipality} onValueChange={handleMunicipalityChange} disabled={!province}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={province ? "Select City / Municipality" : "Select Province first"} />
                </SelectTrigger>
                <SelectContent>
                  {municipalityOptions.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Barangay</Label>
              <Select value={barangay} onValueChange={setBarangay} disabled={!municipality}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={municipality ? "Select Barangay" : "Select City first"} />
                </SelectTrigger>
                <SelectContent>
                  {barangayOptions.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            onClick={() => updateLocation.mutate({ municipality, barangay })}
            disabled={!canSave || updateLocation.isPending}
          >
            {updateLocation.isPending ? "Saving..." : "Save Location"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-sm">
        <CardHeader>
          <CardTitle>Application Preferences</CardTitle>
          <CardDescription>
            General settings for the application interface.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between space-x-2">
            <Label htmlFor="notifications" className="flex flex-col space-y-1">
              <span>Enable Notifications</span>
              <span className="font-normal text-xs text-muted-foreground">Receive alerts for new survey submissions.</span>
            </Label>
            <Switch id="notifications" defaultChecked />
          </div>
          <div className="flex items-center justify-between space-x-2">
            <Label htmlFor="offline" className="flex flex-col space-y-1">
              <span>Offline Mode</span>
              <span className="font-normal text-xs text-muted-foreground">Cache data locally when internet is unavailable.</span>
            </Label>
            <Switch id="offline" defaultChecked />
          </div>
          <div className="flex items-center justify-between space-x-2">
            <Label htmlFor="location" className="flex flex-col space-y-1">
              <span>High Accuracy GPS</span>
              <span className="font-normal text-xs text-muted-foreground">Use precise location tracking for household tagging.</span>
            </Label>
            <Switch id="location" defaultChecked />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
