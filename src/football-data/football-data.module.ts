import { Module } from "@nestjs/common";
import { FootballDataService } from "./football-data.service";

@Module({
    providers: [FootballDataService],
    exports: [FootballDataService]
})
export class FootballDataModule {}
