import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy, VerifyCallback } from "passport-google-oauth20";
import { randomBytes } from "crypto";
import bcrypt from "bcrypt";

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, "google") {
    constructor() {
        super({
            clientID: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            callbackURL: 'http://localhost:8000/api/v1/auth/google/callback',
            // callbackURL: `${process.env.BASE_API_URL}/api/v1/auth/google/callback`, // <-- MUST BE EXACTLY 'callbackURL'
            scope: ["email", "profile"],
            passReqToCallback: true, // Enable access to request object
        });
    }

    async validate(
        request: any,
        accessToken: string,
        refreshToken: string,
        profile: any,
        done: VerifyCallback
    ): Promise<any> {
        try {
            console.log('Google Profile:', profile);
            
            // Generate a secure random password for OAuth users
            const randomPassword = bcrypt.hashSync(randomBytes(32).toString('hex'), 10);
            
            const user = {
                email: profile.emails?.[0]?.value,
                firstName: profile.name?.givenName || '',
                lastName: profile.name?.familyName || '',
                googleId: profile.id,
                phoneNumber: profile.phoneNumbers?.[0]?.value || null,
                profileImage: profile.photos?.[0]?.value || null,
                password: randomPassword, // Secure random password
                provider: 'google',
            };

            // Validate required fields
            if (!user.email) {
                return done(new Error('Email not provided by Google'), false);
            }

            done(null, user);
        } catch (error) {
            console.error('Google OAuth validation error:', error);
            done(error, false);
        }
    }
}