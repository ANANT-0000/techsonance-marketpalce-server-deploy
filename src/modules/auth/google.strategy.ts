import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy, VerifyCallback } from "passport-google-oauth20";

@Injectable()
export class GoogleStrategoy extends PassportStrategy(Strategy, "google") {
    constructor() {
        super({
            clientID: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            callbackURL: process.env.GOOGLE_CALLBACK_URL!,
            scope: ["email", "profile"],
            state: true,
        })
    }
    async validate(accessToken: string, refreshToken: string, profile: any, done: VerifyCallback) {
        console.log(profile);
        const user = {
            email: profile.emails[0].value,
            firstName: profile.name.givenName,
            lastName: profile.name.familyName,
            id: profile.id,
            phoneNumber: profile.phoneNumbers[0].value,
            profileImage: profile.photos[0].value,
        }
        done(null, user);
    }
}