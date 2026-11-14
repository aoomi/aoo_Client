/** Minimal lobby capability consumed by the Club authority package. */
export interface ClubTopBarPort {
    getRoomCard(): number;
    setRoomCard(value: number): void;
    getGold(): number;
    push(owner: string): Promise<void>;
    pop(owner: string): void;
}
