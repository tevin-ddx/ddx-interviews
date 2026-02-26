import type { Party, PartyConnection, PartyServer } from "partykit/server";
import { onConnect } from "y-partykit";

export default class YjsServer implements PartyServer {
  constructor(readonly party: Party) {}

  onConnect(conn: PartyConnection) {
    return onConnect(conn, this.party, { persist: true });
  }
}
