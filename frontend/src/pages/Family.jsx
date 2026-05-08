import { useEffect, useState } from "react";
import { Copy, Crown, DoorOpen, Plus, Users } from "lucide-react";

import Avatar from "../components/Avatar";
import Button from "../components/Button";
import Card from "../components/Card";
import PageHeader from "../components/PageHeader";
import { useAuth } from "../hooks/useAuth";
import { familiesApi } from "../services/api";
import { normalizeApiError } from "../utils/formatters";

export default function Family() {
  const { user } = useAuth();
  const [families, setFamilies] = useState([]);
  const [members, setMembers] = useState([]);
  const [familyName, setFamilyName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const familyRows = await familiesApi.list();
      setFamilies(familyRows);
      if (familyRows.length) {
        setMembers(await familiesApi.members());
      } else {
        setMembers([]);
      }
    } catch (err) {
      setError(normalizeApiError(err));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createFamily(event) {
    event.preventDefault();
    setMessage("");
    setError("");
    try {
      await familiesApi.create({ name: familyName });
      setFamilyName("");
      setMessage("Família criada com sucesso.");
      load();
    } catch (err) {
      setError(normalizeApiError(err));
    }
  }

  async function joinFamily(event) {
    event.preventDefault();
    setMessage("");
    setError("");
    try {
      await familiesApi.join({ invite_code: inviteCode });
      setInviteCode("");
      setMessage("Você entrou na família.");
      load();
    } catch (err) {
      setError(normalizeApiError(err));
    }
  }

  const currentFamily = families[0];

  return (
    <>
      <PageHeader title="Família" subtitle="Gerencie membros, convites e o grupo principal do CasaSync." user={user} />

      {(message || error) && (
        <p className={`mb-5 rounded-2xl px-4 py-3 text-sm font-semibold ${error ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"}`}>
          {error || message}
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <div className="space-y-6">
          <Card>
            <h2 className="section-title">Criar família</h2>
            <form onSubmit={createFamily} className="mt-5 space-y-4">
              <input className="soft-input" placeholder="Nome da família" value={familyName} onChange={(event) => setFamilyName(event.target.value)} required />
              <Button type="submit" className="w-full">
                <Plus className="h-5 w-5" />
                Criar família
              </Button>
            </form>
          </Card>

          <Card>
            <h2 className="section-title">Entrar por convite</h2>
            <form onSubmit={joinFamily} className="mt-5 space-y-4">
              <input className="soft-input uppercase" placeholder="Código de convite" value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} required />
              <Button type="submit" variant="secondary" className="w-full">
                <DoorOpen className="h-5 w-5" />
                Entrar na família
              </Button>
            </form>
          </Card>
        </div>

        <Card>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="section-title">{currentFamily?.name || "Nenhuma família ativa"}</h2>
              <p className="mt-2 text-sm text-muted">Usuários vinculados à família principal.</p>
            </div>
            {currentFamily && (
              <button className="inline-flex items-center gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-blush">
                <Copy className="h-4 w-4" />
                {currentFamily.invite_code}
              </button>
            )}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {members.map((member) => (
              <div key={member.id} className="flex items-center justify-between rounded-[24px] bg-white/75 p-4">
                <div className="flex items-center gap-3">
                  <Avatar user={member.user} size="lg" />
                  <div>
                    <p className="font-bold text-ink">{member.user.name}</p>
                    <p className="text-sm text-muted">{member.role === "owner" ? "Administrador" : "Membro"}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center justify-end gap-1 text-orange-500">
                    {member.role === "owner" ? <Crown className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                    <span className="text-sm font-bold">{member.points} pts</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">ranking ativo</p>
                </div>
              </div>
            ))}
            {!members.length && <p className="rounded-2xl bg-white/70 px-4 py-8 text-center text-sm text-muted md:col-span-2">Crie ou entre em uma família para ver os membros.</p>}
          </div>
        </Card>
      </div>
    </>
  );
}

