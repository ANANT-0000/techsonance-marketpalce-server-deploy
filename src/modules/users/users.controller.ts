import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(private readonly userService: UsersService) {}
  @Get("/:id")
  async getProfile(@Param("id") userId: string) {
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }
    return user;
  }
}
