import { Controller } from "@nestjs/common";
import { AdminService } from "./admin.service";

@Controller({
  version: "1",
  path: "admin",
})
export class AdminController {
  constructor(private readonly adminService: AdminService) {}
}
