import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, Search, MoreVertical, Shield } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";

const roleLabel: Record<string, string> = {
  admin: "Administrator",
  supervisor: "Supervisor",
  surveyor: "Surveyor",
  user: "User",
};

const initialsFromName = (name: string): string => {
  const words = name.split(" ").filter(Boolean);
  if (words.length === 0) return "US";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
};

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const utils = trpc.useUtils();
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "surveyor" | "supervisor" | "user">("surveyor");
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editRole, setEditRole] = useState<"admin" | "surveyor" | "supervisor" | "user">("surveyor");
  const usersQuery = trpc.auth.listLocalUsers.useQuery();
  const resetPasswordMutation = trpc.auth.resetLocalUserPassword.useMutation({
    onSuccess: async () => {
      toast.success("Password reset successfully.");
      await utils.auth.listLocalUsers.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to reset password.");
    },
  });
  const setUserActiveMutation = trpc.auth.setLocalUserActive.useMutation({
    onSuccess: async (_, variables) => {
      toast.success(variables.isActive ? "User activated." : "User deactivated.");
      await utils.auth.listLocalUsers.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update user status.");
    },
  });
  const updateUserDetailsMutation = trpc.auth.updateLocalUserDetails.useMutation({
    onSuccess: async () => {
      toast.success("User details updated.");
      setEditingUserId(null);
      await utils.auth.listLocalUsers.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update user details.");
    },
  });
  const deleteLocalUserMutation = trpc.auth.deleteLocalUser.useMutation({
    onSuccess: async () => {
      toast.success("User deleted successfully.");
      await utils.auth.listLocalUsers.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete user.");
    },
  });
  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: async () => {
      toast.success("User created successfully.");
      setShowAddForm(false);
      setNewName("");
      setNewUsername("");
      setNewPassword("");
      setConfirmPassword("");
      setNewRole("surveyor");
      await utils.auth.listLocalUsers.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create user.");
    },
  });

  const handleAddUser = async () => {
    const trimmedName = newName.trim();
    const trimmedUsername = newUsername.trim();

    if (!trimmedName || !trimmedUsername || !newPassword) {
      toast.error("Name, username, and password are required.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    await registerMutation.mutateAsync({
      name: trimmedName,
      username: trimmedUsername,
      password: newPassword,
      role: newRole,
    });
  };

  const users = useMemo(() => {
    const list = usersQuery.data ?? [];
    const query = searchTerm.trim().toLowerCase();
    if (!query) return list;

    return list.filter((user) => {
      const name = (user.name ?? "").toLowerCase();
      const email = (user.email ?? "").toLowerCase();
      const username = (user.username ?? "").toLowerCase();
      const role = (user.role ?? "").toLowerCase();
      return (
        name.includes(query) ||
        email.includes(query) ||
        username.includes(query) ||
        role.includes(query)
      );
    });
  }, [usersQuery.data, searchTerm]);

  const handleResetPassword = async (targetUserId: number) => {
    const newPassword = window.prompt("Enter new password (minimum 6 characters):", "");
    if (!newPassword) return;
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }

    const confirm = window.prompt("Confirm new password:", "");
    if (confirm === null) return;
    if (newPassword !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }

    await resetPasswordMutation.mutateAsync({
      userId: targetUserId,
      newPassword,
    });
  };

  const handleToggleActive = async (
    targetUserId: number,
    targetName: string,
    currentIsActive: boolean
  ) => {
    const nextIsActive = !currentIsActive;
    const actionText = nextIsActive ? "activate" : "deactivate";
    const confirmed = window.confirm(`Are you sure you want to ${actionText} ${targetName}?`);
    if (!confirmed) return;

    await setUserActiveMutation.mutateAsync({
      userId: targetUserId,
      isActive: nextIsActive,
    });
  };

  const handleStartEdit = (target: {
    id: number;
    name: string | null;
    email: string | null;
    username: string;
    role: string;
  }) => {
    setEditingUserId(target.id);
    setEditName(target.name ?? "");
    setEditEmail(target.email ?? "");
    setEditUsername(target.username ?? "");
    setEditRole(
      target.role === "admin" || target.role === "surveyor" || target.role === "supervisor" || target.role === "user"
        ? target.role
        : "surveyor"
    );
  };

  const handleSaveEdit = async () => {
    if (!editingUserId) return;
    const trimmedName = editName.trim();
    const trimmedUsername = editUsername.trim();
    const trimmedEmail = editEmail.trim();

    if (!trimmedName) {
      toast.error("Name is required.");
      return;
    }
    if (!trimmedUsername || trimmedUsername.length < 3) {
      toast.error("Username must be at least 3 characters.");
      return;
    }

    await updateUserDetailsMutation.mutateAsync({
      userId: editingUserId,
      name: trimmedName,
      username: trimmedUsername,
      email: trimmedEmail ? trimmedEmail : null,
      role: editRole,
    });
  };

  const handleDeleteUser = async (targetUserId: number, targetName: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete ${targetName}? This cannot be undone.`
    );
    if (!confirmed) return;

    await deleteLocalUserMutation.mutateAsync({
      userId: targetUserId,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">User Management</h2>
          <p className="text-muted-foreground mt-1">
            Manage system access and assign roles to personnel.
          </p>
        </div>
        <Button className="shadow-lg hover:shadow-xl transition-all duration-200" onClick={() => setShowAddForm((prev) => !prev)}>
          <Plus className="mr-2 h-4 w-4" /> Add User
        </Button>
      </div>

      {showAddForm && (
        <Card className="border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle>Create User</CardTitle>
            <CardDescription>Create a real backend account with local username/password.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="newName">Full Name</Label>
                <Input id="newName" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Maria Santos" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newUsername">Username</Label>
                <Input id="newUsername" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="e.g. maria@barangay.gov.ph" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">Password</Label>
                <Input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 6 characters" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter password" />
              </div>
              <div className="space-y-2">
                <Label>User Role</Label>
                <Select value={newRole} onValueChange={(value) => setNewRole(value as "admin" | "surveyor" | "supervisor" | "user")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrator</SelectItem>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                    <SelectItem value="surveyor">Surveyor</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAddForm(false)} disabled={registerMutation.isPending}>
                Cancel
              </Button>
              <Button onClick={handleAddUser} disabled={registerMutation.isPending}>
                {registerMutation.isPending ? "Creating..." : "Create User"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/50 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>System Users</CardTitle>
              <CardDescription>Real backend local-auth users and their active usernames.</CardDescription>
            </div>
            <div className="relative w-64 hidden sm:block">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                className="pl-9 bg-secondary/20"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {usersQuery.isLoading && <p className="text-sm text-muted-foreground">Loading users...</p>}
          {usersQuery.error && (
            <p className="text-sm text-destructive">Failed to load users: {usersQuery.error.message}</p>
          )}

          <Table>
            <TableHeader className="bg-secondary/30">
              <TableRow>
                <TableHead className="w-[250px]">User</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Auth Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id} className="group hover:bg-secondary/10 transition-colors">
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9 border border-border">
                        <AvatarFallback className="bg-primary/10 text-primary font-medium">
                          {initialsFromName(user.name ?? "User")}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">{user.name ?? "Unnamed User"}</div>
                        <div className="text-xs text-muted-foreground">{user.email ?? "No email"}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-mono">{user.username}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Shield className="h-3 w-3 text-muted-foreground" />
                      <span className="text-sm">{roleLabel[user.role] ?? user.role}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{user.loginMethod ?? "local-password"}</span>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant="outline" 
                      className={user.isActive ? "bg-green-100 text-green-700 border-green-200" : "bg-gray-100 text-gray-700 border-gray-200"}
                    >
                      {user.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem
                          onSelect={(event) => {
                            event.preventDefault();
                            handleStartEdit({
                              id: user.id,
                              name: user.name,
                              email: user.email,
                              username: user.username,
                              role: user.role,
                            });
                          }}
                          disabled={updateUserDetailsMutation.isPending}
                        >
                          Edit Details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={(event) => {
                            event.preventDefault();
                            void handleResetPassword(user.id);
                          }}
                          disabled={resetPasswordMutation.isPending}
                        >
                          Reset Password
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className={!user.isActive ? "text-foreground" : "text-destructive"}
                          onSelect={(event) => {
                            event.preventDefault();
                            void handleToggleActive(user.id, user.name ?? "this user", Boolean(user.isActive));
                          }}
                          disabled={setUserActiveMutation.isPending || (!user.isActive ? false : currentUser?.id === user.id)}
                        >
                          {user.isActive ? "Deactivate User" : "Activate User"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onSelect={(event) => {
                            event.preventDefault();
                            void handleDeleteUser(user.id, user.name ?? "this user");
                          }}
                          disabled={deleteLocalUserMutation.isPending || currentUser?.id === user.id}
                        >
                          Delete User
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {!usersQuery.isLoading && !usersQuery.error && users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No backend users found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={editingUserId !== null} onOpenChange={(open) => !open && setEditingUserId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User Details</DialogTitle>
            <DialogDescription>Update account information and role for this user.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="editName">Full Name</Label>
              <Input id="editName" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editEmail">Email</Label>
              <Input id="editEmail" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editUsername">Username</Label>
              <Input id="editUsername" value={editUsername} onChange={(e) => setEditUsername(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={editRole} onValueChange={(value) => setEditRole(value as "admin" | "surveyor" | "supervisor" | "user")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrator</SelectItem>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                  <SelectItem value="surveyor">Surveyor</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUserId(null)} disabled={updateUserDetailsMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveEdit()} disabled={updateUserDetailsMutation.isPending}>
              {updateUserDetailsMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
